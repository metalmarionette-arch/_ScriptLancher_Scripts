/* ============================================================
   Precomp（選択レイヤーをプリコン）
   v1.1.5
   - 前後にフレームを伸ばす機能を削除
   - 先頭ナンバリングON/OFF
   - ナンバリング桁数指定（例: 2桁=01, 3桁=001）
   ============================================================ */

(function (thisObj) {

    var GLOBAL_UI_KEY = "__AE_pricon_v1_1_4_ui__";

    // -------------------------------
    // Utils
    // -------------------------------
    function isComp(item) {
        return item && (item instanceof CompItem);
    }

    function quantizeToFrame(t, comp) {
        // AEのフレーム境界へスナップ
        if (!comp) return t;
        var fd = comp.frameDuration;
        return Math.round(t / fd) * fd;
    }

    function parseNonNegativeInt(str) {
        if (str === null || str === undefined) return 0;
        var v = parseInt(String(str).replace(/,/g, ""), 10);
        if (isNaN(v) || !isFinite(v)) return 0;
        if (v < 0) v = 0;
        return v;
    }

    function padNumber(num, digits) {
        var n = Math.max(0, parseInt(num, 10) || 0);
        var d = Math.max(1, parseInt(digits, 10) || 1);
        // 極端に大きい桁数はUI上の事故を防ぐため制限
        if (d > 10) d = 10;
        var s = String(n);
        while (s.length < d) s = "0" + s;
        return s;
    }

    function sanitizeCompName(name) {
        var s = name;
        s = s.replace(/[\\\/\:\*\?\"\<\>\|]/g, "_");
        s = s.replace(/[\r\n\t]/g, " ");
        s = s.replace(/^\s+|\s+$/g, "");
        if (s === "") s = "Precomp";
        return s;
    }

    // ------------------------------------------------
    // Safe layer edges utilities
    // ------------------------------------------------
    function setLayerEdgesSafe(layer, newIn, newOut) {
        if (!layer) return;
        if (newOut < newIn) {
            // out が in より前は無理なので丸める
            newOut = newIn;
        }
        layer.inPoint = newIn;
        layer.outPoint = newOut;
    }

    function shiftLayerTimeSafe(layer, deltaSec) {
        if (!layer) return;
        layer.startTime += deltaSec;
    }

    function setCompDurationAndWorkArea(comp, durationSec) {
        if (!comp) return;
        var d = Math.max(comp.frameDuration, durationSec);
        comp.duration = d;
        comp.workAreaStart = 0;
        comp.workAreaDuration = d;
    }

    function ensurePositiveDuration(comp) {
        if (!comp) return;
        if (comp.duration <= 0) {
            comp.duration = comp.frameDuration;
            comp.workAreaStart = 0;
            comp.workAreaDuration = comp.duration;
        }
    }

    // ------------------------------------------------
    // Precomp helpers
    // ------------------------------------------------
    function findPrecompLayerInComp(parentComp, precompItem) {
        if (!parentComp || !precompItem) return null;
        for (var i = 1; i <= parentComp.numLayers; i++) {
            var l = parentComp.layer(i);
            if (l && l.source === precompItem) return l;
        }
        return null;
    }

    function normalizePrecompToSelectedRange(precomp, selectedMinIn, selectedMaxOut) {
        if (!precomp) return;
        ensurePositiveDuration(precomp);

        // 選択レイヤーの最小inを0へ合わせる（トラックマット等の相対関係は保持）
        if (selectedMinIn !== 0) {
            for (var i = 1; i <= precomp.numLayers; i++) {
                var l = precomp.layer(i);
                if (!l) continue;
                shiftLayerTimeSafe(l, -selectedMinIn);
            }
        }

        // プリコン尺は「選択レイヤーの尺」のみで確定
        var selectedDuration = selectedMaxOut - selectedMinIn;
        if (selectedDuration <= 0) selectedDuration = precomp.frameDuration;
        setCompDurationAndWorkArea(precomp, selectedDuration);
    }

    function placeAndTrimPrecompLayer(parentComp, precompItem, parentStartSec) {
        // 親コンポ内のプリコンレイヤーを、元の位置に合わせて置き、尺にトリム
        if (!parentComp || !precompItem) return;
        var preLayer = findPrecompLayerInComp(parentComp, precompItem);
        if (!preLayer) return;

        // 親コンポ上の開始位置に置く
        preLayer.startTime = parentStartSec;

        // プリコン尺に合わせて in/out を確定
        var dur = precompItem.duration;
        if (dur <= 0) dur = parentComp.frameDuration;

        var newIn = quantizeToFrame(preLayer.startTime, parentComp);
        var newOut = quantizeToFrame(preLayer.startTime + dur, parentComp);

        setLayerEdgesSafe(preLayer, newIn, newOut);
    }

    // ------------------------------------------------
    // Core
    // ------------------------------------------------
    function runPrecomp(prefix, suffix, perLayerMode, addNumberHead, numberDigits) {
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

        addNumberHead = (addNumberHead === true);
        numberDigits = parseNonNegativeInt(numberDigits);
        if (numberDigits < 1) numberDigits = 1;
        if (numberDigits > 10) numberDigits = 10;

        if (perLayerMode) {
            // インデックス降順で処理（インデックスずれ対策）
            var indices = [];
            for (var i = 0; i < sel.length; i++) indices.push(sel[i].index);

            // ナンバリング（見た目の順番＝インデックス昇順で採番。処理自体は降順で安全に実行）
            var numMap = {};
            if (addNumberHead) {
                var asc = indices.slice().sort(function (a, b) { return a - b; });
                for (var nn = 0; nn < asc.length; nn++) numMap[asc[nn]] = (nn + 1);
            }

            indices.sort(function (a, b) { return b - a; });

            for (var k = 0; k < indices.length; k++) {
                var idx = indices[k];
                if (idx < 1 || idx > comp.numLayers) continue;

                var targetLayer = comp.layer(idx);
                if (!targetLayer) continue;

                // 選択レイヤーの尺（トラックマットは含めない）
                var selectedMinIn = targetLayer.inPoint;
                var selectedMaxOut = targetLayer.outPoint;

                var coreName = (prefix + targetLayer.name + suffix);
                var compName = addNumberHead
                    ? sanitizeCompName(padNumber(numMap[idx] || 0, numberDigits) + "_" + coreName)
                    : sanitizeCompName(coreName);

                var precomp = comp.layers.precompose([idx], compName, true);

                // 単体：選択レイヤー尺を基準に0開始＆尺確定
                normalizePrecompToSelectedRange(precomp, selectedMinIn, selectedMaxOut);

                // 親コンポ側：選択レイヤーの元位置に置き、プリコン尺でトリム
                placeAndTrimPrecompLayer(comp, precomp, selectedMinIn);
            }

        } else {
            // 選択レイヤーをまとめて1つ
            var indicesAll = [];
            var minInAll = 1e10;
            var maxOutAll = -1e10;

            for (var s = 0; s < sel.length; s++) {
                var lay = sel[s];
                indicesAll.push(lay.index);
                if (lay.inPoint < minInAll) minInAll = lay.inPoint;
                if (lay.outPoint > maxOutAll) maxOutAll = lay.outPoint;
            }

            indicesAll.sort(function (a, b) { return a - b; });

            var baseName = sel[0].name;
            var coreNameAll = (prefix + baseName + suffix);
            var compNameAll = addNumberHead
                ? sanitizeCompName(padNumber(1, numberDigits) + "_" + coreNameAll)
                : sanitizeCompName(coreNameAll);

            var precompAll = comp.layers.precompose(indicesAll, compNameAll, true);

            // 相対関係を維持しつつ、選択レイヤー尺で0開始＆尺確定
            normalizePrecompToSelectedRange(precompAll, minInAll, maxOutAll);

            // 親コンポ側：元の最小in位置に置き、選択レイヤー尺でトリム
            placeAndTrimPrecompLayer(comp, precompAll, minInAll);
        }
    }

    // -------------------------------
    // UI
    // -------------------------------
    function bringWindowToFront(win) {
        if (!(win instanceof Window)) return;
        try { win.show(); } catch (e1) {}
        try { win.active = true; } catch (e2) {}
    }

    function getSingletonWindow() {
        var g = $.global;
        if (!g) return null;
        var existing = g[GLOBAL_UI_KEY];
        if (!(existing instanceof Window)) return null;

        // 既に閉じられている参照を掃除
        try {
            var _ = existing.visible;
        } catch (e) {
            g[GLOBAL_UI_KEY] = null;
            return null;
        }
        return existing;
    }

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", "Precomp（選択レイヤーをプリコン）", undefined, { resizeable: true });

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

        var gNum = pnName.add("group");
        gNum.orientation = "row";
        gNum.alignChildren = ["left", "center"];
        var cbNumberHead = gNum.add("checkbox", undefined, "先頭に番号");
        cbNumberHead.value = false;
        gNum.add("statictext", undefined, "桁数");
        var etNumberDigits = gNum.add("edittext", undefined, "3");
        etNumberDigits.characters = 6;

        var pnMode = win.add("panel", undefined, "プリコン方式");
        pnMode.orientation = "column";
        pnMode.alignChildren = ["fill", "top"];

        var rbEach = pnMode.add("radiobutton", undefined, "選択レイヤーごとにプリコン作成");
        var rbAll = pnMode.add("radiobutton", undefined, "選択レイヤー全てで1つのプリコン作成");
        rbEach.value = true;

        var gBtns = win.add("group");
        gBtns.orientation = "row";
        gBtns.alignChildren = ["fill", "center"];

        var btnRun = gBtns.add("button", undefined, "実行");
        var btnClose = gBtns.add("button", undefined, "閉じる");

        btnRun.onClick = function () {
            app.beginUndoGroup("Precomp SafeTiming + Numbering");
            try {
                var addNumberHead = (cbNumberHead.value === true);
                var numberDigits = parseNonNegativeInt(etNumberDigits.text);
                if (numberDigits < 1) numberDigits = 1;
                if (numberDigits > 10) numberDigits = 10;

                runPrecomp(
                    etPrefix.text,
                    etSuffix.text,
                    rbEach.value,
                    addNumberHead,
                    numberDigits
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

        if (win instanceof Window) {
            win.onClose = function () {
                if ($.global && $.global[GLOBAL_UI_KEY] === win) {
                    $.global[GLOBAL_UI_KEY] = null;
                }
            };
        }

        win.onResizing = win.onResize = function () {
            try { this.layout.resize(); } catch (e) {}
        };

        return win;
    }

    if (!(thisObj instanceof Panel)) {
        var existingWin = getSingletonWindow();
        if (existingWin) {
            bringWindowToFront(existingWin);
            return;
        }
    }

    var ui = buildUI(thisObj);
    if (ui instanceof Window) {
        $.global[GLOBAL_UI_KEY] = ui;
        ui.center();
        ui.show();
    } else {
        ui.layout.layout(true);
        ui.layout.resize();
    }

})(this);
