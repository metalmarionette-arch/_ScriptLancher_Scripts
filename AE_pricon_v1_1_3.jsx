/* =====================================================================
   Precomp By Selected Layer Duration (+前後に伸ばす / フレーム指定)
   修正版：
   - プリコン内レイヤーが「どこかへ行く」「1フレーム化して消える」を回避
   - 単体：必ず0フレーム開始
   - 複数(まとめて1つ)：
       Front/Back=0 → 時間順に詰めて0フレームから順番に配置（連結）
       Front/Back>0 → 先頭を0に揃えるだけ（相対関係は維持）
   ===================================================================== */

(function (thisObj) {
    var GLOBAL_KEY = "__AE_pricon_v1_1_3_UI__";

    // -------------------------------
    // Utils
    // -------------------------------
    function isComp(item) {
        return (item && item instanceof CompItem);
    }

    function sanitizeCompName(name) {
        var s = name;
        s = s.replace(/[\\\/\:\*\?\"\<\>\|]/g, "_");
        s = s.replace(/[\r\n\t]/g, " ");
        s = s.replace(/^\s+|\s+$/g, "");
        if (s === "") s = "Precomp";
        return s;
    }

    function parseNonNegativeInt(str) {
        if (str === null || str === undefined) return 0;
        var v = parseInt(String(str).replace(/,/g, ""), 10);
        if (isNaN(v) || !isFinite(v)) return 0;
        if (v < 0) v = 0;
        return v;
    }

    function framesToSeconds(frames, comp) {
        frames = Math.max(0, frames || 0);
        var fd = (comp && comp.frameDuration) ? comp.frameDuration : (1 / 30);
        return frames * fd;
    }

    function quantizeToFrame(t, comp) {
        var fd = (comp && comp.frameDuration) ? comp.frameDuration : (1 / 30);
        return Math.round(t / fd) * fd;
    }

    function ensurePositiveDuration(dur, frameDuration) {
        if (dur <= 0) return Math.max(frameDuration, 1 / 60);
        return dur;
    }

    function setLayerEdgesSafe(layer, newIn, newOut) {
        if (!layer) return;

        if (newIn > newOut) {
            var tmp = newIn;
            newIn = newOut;
            newOut = tmp;
        }

        // 1フレーム未満に潰れるのを回避（最低1フレーム）
        var fd = (layer.containingComp && layer.containingComp.frameDuration) ? layer.containingComp.frameDuration : (1 / 30);
        if ((newOut - newIn) < fd) newOut = newIn + fd;

        try { layer.inPoint = newIn; } catch (e1) {}
        try { layer.outPoint = newOut; } catch (e2) {}
    }

    function findPrecompLayerInComp(comp, precompItem, fallbackIndex) {
        if (fallbackIndex && fallbackIndex >= 1 && fallbackIndex <= comp.numLayers) {
            var l = comp.layer(fallbackIndex);
            try { if (l && l.source === precompItem) return l; } catch (e0) {}
        }
        for (var i = 1; i <= comp.numLayers; i++) {
            var lyr = comp.layer(i);
            try { if (lyr && lyr.source === precompItem) return lyr; } catch (e1) {}
        }
        return null;
    }

    // ★安全な時間シフト：まず startTime を動かし、in/out が追従しない場合だけ補正
    function shiftLayerTimeSafe(layer, delta, eps) {
        if (!layer) return;

        var oldIn = layer.inPoint;
        var oldOut = layer.outPoint;
        var oldStart = layer.startTime;

        var movedByStart = false;

        try {
            layer.startTime = oldStart + delta;
            movedByStart = true;
        } catch (e0) {}

        // startTime 変更で inPoint が期待どおり動いているか確認
        var newIn = layer.inPoint;
        var expectedIn = oldIn + delta;

        // 追従していないなら in/out を補正（ただし二重シフトはしない）
        if (!movedByStart || Math.abs(newIn - expectedIn) > eps) {
            try { layer.inPoint = expectedIn; } catch (e1) {}
            try { layer.outPoint = oldOut + delta; } catch (e2) {}
        }
    }

    function setCompDurationAndWorkArea(compItem, dur) {
        if (!(compItem && compItem instanceof CompItem)) return;
        dur = ensurePositiveDuration(dur, compItem.frameDuration);

        try { compItem.displayStartTime = 0; } catch (e0) {}
        try {
            compItem.workAreaStart = 0;
            compItem.workAreaDuration = dur;
        } catch (e1) {}
        try { compItem.duration = dur; } catch (e2) {}
    }

    // プリコン内を「最も早いinPointを0」に揃える（相対関係は維持）
    function normalizePrecompStartToZero(precomp) {
        if (!(precomp && precomp instanceof CompItem)) return;

        var earliestIn = 1e10;
        var latestOut = -1e10;

        for (var i = 1; i <= precomp.numLayers; i++) {
            var lyr = precomp.layer(i);
            if (!lyr) continue;
            if (lyr.inPoint < earliestIn) earliestIn = lyr.inPoint;
            if (lyr.outPoint > latestOut) latestOut = lyr.outPoint;
        }

        if (earliestIn === 1e10 || latestOut === -1e10) {
            setCompDurationAndWorkArea(precomp, precomp.frameDuration);
            return;
        }

        var eps = precomp.frameDuration / 10;
        var delta = -earliestIn;

        // 0に揃える
        for (var j = 1; j <= precomp.numLayers; j++) {
            shiftLayerTimeSafe(precomp.layer(j), delta, eps);
        }

        // もう一度範囲を取り直してdurationを確定（丸め誤差対策）
        var newLatestOut = -1e10;
        for (var k = 1; k <= precomp.numLayers; k++) {
            var l2 = precomp.layer(k);
            if (!l2) continue;
            if (l2.outPoint > newLatestOut) newLatestOut = l2.outPoint;
        }

        setCompDurationAndWorkArea(precomp, newLatestOut);
    }

    // ★複数レイヤーを「時間順に詰めて」0フレームから順番に配置（連結）
    function packPrecompLayersSequentialFromZero(precomp) {
        if (!(precomp && precomp instanceof CompItem)) return;

        var layers = [];
        for (var i = 1; i <= precomp.numLayers; i++) {
            var lyr = precomp.layer(i);
            if (!lyr) continue;
            layers.push({
                layer: lyr,
                inP: lyr.inPoint,
                outP: lyr.outPoint,
                idx: i
            });
        }

        if (layers.length === 0) {
            setCompDurationAndWorkArea(precomp, precomp.frameDuration);
            return;
        }

        // 時間順（同値はインデックス順）
        layers.sort(function (a, b) {
            if (a.inP < b.inP) return -1;
            if (a.inP > b.inP) return 1;
            return a.idx - b.idx;
        });

        var eps = precomp.frameDuration / 10;
        var cur = 0;

        for (var j = 0; j < layers.length; j++) {
            var lyr2 = layers[j].layer;

            // 現在のin/outを都度読む（前のシフトで変化するため）
            var inNow = lyr2.inPoint;
            var outNow = lyr2.outPoint;

            var dur = outNow - inNow;
            dur = Math.max(dur, precomp.frameDuration); // 0〜1フレーム化の保険

            // inPoint を cur に合わせるシフト量
            var delta = cur - inNow;
            shiftLayerTimeSafe(lyr2, delta, eps);

            // 次の開始（詰めて連結）
            cur = cur + dur;

            // 端数をフレームに揃える
            cur = quantizeToFrame(cur, precomp);
        }

        setCompDurationAndWorkArea(precomp, cur);
    }

    // 親コンポ側のプリコンレイヤーを、プリコン尺に合わせて配置＆トリム
    function placeAndTrimPrecompLayer(parentComp, precompItem, precompLayerIndexHint, startTimeInParent) {
        var preLayer = findPrecompLayerInComp(parentComp, precompItem, precompLayerIndexHint);
        if (!preLayer) return;

        var st = quantizeToFrame(startTimeInParent, parentComp);

        try { preLayer.startTime = st; } catch (e0) {}

        // in/out は「プリコン尺」に合わせる（＝startTime + precomp.duration）
        var newIn = st;
        var newOut = st + precompItem.duration;

        newIn = quantizeToFrame(newIn, parentComp);
        newOut = quantizeToFrame(newOut, parentComp);

        setLayerEdgesSafe(preLayer, newIn, newOut);
    }

    // -------------------------------
    // Core
    // -------------------------------
    function runPrecomp(prefix, suffix, perLayerMode, frontFrames, backFrames) {
        var comp = app.project.activeItem;

        if (!isComp(comp)) {
            throw new Error("アクティブなコンポジションを開いて、レイヤーを選択してください。");
        }

        var sel = comp.selectedLayers;
        if (!sel || sel.length === 0) {
            throw new Error("レイヤーを1つ以上選択してください。");
        }

        prefix = prefix || "";
        suffix = suffix || "";

        var frontExtSec = framesToSeconds(frontFrames, comp);
        var backExtSec  = framesToSeconds(backFrames, comp);

        if (perLayerMode) {
            // インデックス降順で処理（インデックスずれ対策）
            var indices = [];
            for (var i = 0; i < sel.length; i++) indices.push(sel[i].index);
            indices.sort(function (a, b) { return b - a; });

            for (var k = 0; k < indices.length; k++) {
                var idx = indices[k];
                if (idx < 1 || idx > comp.numLayers) continue;

                var targetLayer = comp.layer(idx);
                if (!targetLayer) continue;

                // 伸ばし（フレーム分）
                if (frontExtSec > 0 || backExtSec > 0) {
                    var newIn = quantizeToFrame(targetLayer.inPoint - frontExtSec, comp);
                    var newOut = quantizeToFrame(targetLayer.outPoint + backExtSec, comp);
                    setLayerEdgesSafe(targetLayer, newIn, newOut);
                }

                // 親コンポ上の開始位置（伸ばし後のinPoint）
                var parentStart = targetLayer.inPoint;

                var compName = sanitizeCompName(prefix + targetLayer.name + suffix);

                var precomp = comp.layers.precompose([idx], compName, true);

                // ★単体は必ず0フレーム開始に揃える
                normalizePrecompStartToZero(precomp);

                // 親コンポ側：元の場所に置き、プリコン尺に合わせてトリム
                placeAndTrimPrecompLayer(comp, precomp, idx, parentStart);
            }

        } else {
            // 選択レイヤーをまとめて1つ
            var indicesAll = [];

            // 伸ばす対象：最も手前(in最小)と最も後ろ(out最大)
            var earliestLayer = null;
            var latestLayer = null;
            var earliestIn = 1e10;
            var latestOut = -1e10;

            for (var j = 0; j < sel.length; j++) {
                var lyr = sel[j];
                indicesAll.push(lyr.index);

                if (lyr.inPoint < earliestIn) {
                    earliestIn = lyr.inPoint;
                    earliestLayer = lyr;
                }
                if (lyr.outPoint > latestOut) {
                    latestOut = lyr.outPoint;
                    latestLayer = lyr;
                }
            }

            // 伸ばし（指定がある場合のみ）
            if (frontExtSec > 0 && earliestLayer) {
                setLayerEdgesSafe(
                    earliestLayer,
                    quantizeToFrame(earliestLayer.inPoint - frontExtSec, comp),
                    earliestLayer.outPoint
                );
            }
            if (backExtSec > 0 && latestLayer) {
                setLayerEdgesSafe(
                    latestLayer,
                    latestLayer.inPoint,
                    quantizeToFrame(latestLayer.outPoint + backExtSec, comp)
                );
            }

            // 親コンポ上での開始位置（伸ばし後の最小in）
            var minInAll = 1e10;
            for (var m = 0; m < sel.length; m++) {
                if (sel[m].inPoint < minInAll) minInAll = sel[m].inPoint;
            }

            indicesAll.sort(function (a, b) { return a - b; });

            var baseName = sel[0].name;
            var compNameAll = sanitizeCompName(prefix + baseName + suffix);

            var minIndex = indicesAll[0];
            var precompAll = comp.layers.precompose(indicesAll, compNameAll, true);

            // ★複数選択でも「シーケンス化（詰めて連結）」せず、相対関係を維持したまま最小inPointを0に揃える
            // （＝親コンポ上の見え方をそのままプリコン内に持ち込む）
            normalizePrecompStartToZero(precompAll);

            // 親コンポ側：元の最小in位置に置き、プリコン尺に合わせてトリム
            placeAndTrimPrecompLayer(comp, precompAll, minIndex, minInAll);
        }
    }

    // -------------------------------
    // UI
    // -------------------------------
    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", "Precomp（選択レイヤー尺＋前後伸ばし/frames）", undefined, { resizeable: true });

        win.orientation = "column";
        win.alignChildren = ["fill", "top"];

        var pnName = win.add("panel", undefined, "プリコン名");
        pnName.orientation = "column";
        pnName.alignChildren = ["fill", "top"];

        var gPref = pnName.add("group");
        gPref.orientation = "row";
        gPref.alignChildren = ["left", "center"];
        gPref.add("statictext", undefined, "Prefix");
        var etPrefix = gPref.add("edittext", undefined, "");
        etPrefix.characters = 28;

        var gSuf = pnName.add("group");
        gSuf.orientation = "row";
        gSuf.alignChildren = ["left", "center"];
        gSuf.add("statictext", undefined, "Suffix");
        var etSuffix = gSuf.add("edittext", undefined, "");
        etSuffix.characters = 28;

        var pnExtend = win.add("panel", undefined, "前後に伸ばす（フレーム）");
        pnExtend.orientation = "column";
        pnExtend.alignChildren = ["fill", "top"];

        var gFront = pnExtend.add("group");
        gFront.orientation = "row";
        gFront.alignChildren = ["left", "center"];
        gFront.add("statictext", undefined, "Front（前）");
        var etFront = gFront.add("edittext", undefined, "0");
        etFront.characters = 10;
        gFront.add("statictext", undefined, "frames");

        var gBack = pnExtend.add("group");
        gBack.orientation = "row";
        gBack.alignChildren = ["left", "center"];
        gBack.add("statictext", undefined, "Back（後）");
        var etBack = gBack.add("edittext", undefined, "0");
        etBack.characters = 10;
        gBack.add("statictext", undefined, "frames");

        var pnMode = win.add("panel", undefined, "モード");
        pnMode.orientation = "column";
        pnMode.alignChildren = ["left", "top"];

        var rbEach = pnMode.add("radiobutton", undefined, "選択レイヤーごとにプリコン作成");
        var rbAll  = pnMode.add("radiobutton", undefined, "選択レイヤー全てで1つのプリコン作成");
        rbEach.value = true;

        var gBtns = win.add("group");
        gBtns.orientation = "row";
        gBtns.alignChildren = ["fill", "center"];

        var btnRun = gBtns.add("button", undefined, "実行");
        var btnClose = gBtns.add("button", undefined, "閉じる");

        btnRun.onClick = function () {
            app.beginUndoGroup("Precomp By Layer Duration + Extend(frames) + SafeTiming");
            try {
                var frontFrames = parseNonNegativeInt(etFront.text);
                var backFrames  = parseNonNegativeInt(etBack.text);

                runPrecomp(
                    etPrefix.text,
                    etSuffix.text,
                    rbEach.value,
                    frontFrames,
                    backFrames
                );
            } catch (err) {
                alert(err.toString());
            } finally {
                app.endUndoGroup();
            }
        };

        btnClose.onClick = function () {
            if (win instanceof Window) win.close();
        };

        win.onResizing = win.onResize = function () {
            try { this.layout.resize(); } catch (e) {}
        };

        return win;
    }

    if (!(thisObj instanceof Panel)) {
        if (!($.global[GLOBAL_KEY] === undefined || $.global[GLOBAL_KEY] === null)) {
            try {
                $.global[GLOBAL_KEY].show();
                $.global[GLOBAL_KEY].active = true;
            } catch (_reuseErr) {}
            return;
        }
    }

    var ui = buildUI(thisObj);
    if (ui instanceof Window) {
        $.global[GLOBAL_KEY] = ui;
        ui.onClose = function () {
            try { $.global[GLOBAL_KEY] = null; } catch (_closeErr) {}
        };
        ui.center();
        ui.show();
    } else {
        ui.layout.layout(true);
        ui.layout.resize();
    }

})(this);
