// AE_Sequencer_Offset_UI_v1_06.jsx
// 変更点：
// ・画像ボタンサイズを 24x24（以前は48x48）
// ・UIは常に起動可能に。実行時にアクティブコンポ／選択対象をチェック
// ・A:上→下、B:下→上、C:ランダム順で「フレーム数」ずつ階段オフセット
// ・Step=何個ごとに増分を進めるか（例: Step=2 → 2個同オフセット→次の2個で+フレーム数）
// ・対象を「レイヤー」または「アニメーションカーブ（選択プロパティ）」から切替可能
// ・カーブモードは「レイヤー単位」でオフセット（同レイヤー内の複数プロパティは同じ量で移動）

#target aftereffects

(function () {
    var GLOBAL_KEY = "__AE_Sequencer_Offset_UI_v1_06__";
    if (!($.global[GLOBAL_KEY] === undefined || $.global[GLOBAL_KEY] === null)) {
        try {
            $.global[GLOBAL_KEY].show();
            $.global[GLOBAL_KEY].active = true;
        } catch (_reuseErr) {}
        return;
    }

    // --- 画像読み込み（スクリプト隣の AE_Sequencer_png） ---
    function loadIcon(filename) {
        try {
            var base = File($.fileName).parent; // このスクリプトのあるフォルダ
            var folder = Folder(base.fsName + "/AE_Sequencer_png");
            var f = File(folder.fsName + "/" + filename);
            if (f.exists) return ScriptUI.newImage(f);
        } catch (e) {}
        return null;
    }

    var iconA = loadIcon("Sequencer_a.png");
    var iconB = loadIcon("Sequencer_b.png");
    var iconC = loadIcon("Sequencer_c.png");
    var iconD = loadIcon("Sequencer_d.png");
    var iconE = loadIcon("Sequencer_e.png");

    // --- UI ---
    var win = new Window("palette", "Sequencer Offset", undefined, { resizeable: false });
    $.global[GLOBAL_KEY] = win;
    win.onClose = function () {
        try { $.global[GLOBAL_KEY] = null; } catch (_closeErr) {}
    };
    win.orientation = "column";
    win.margins = 10;
    win.alignChildren = ["fill", "top"];

    // 入力行
    var gInputs = win.add("group");
    gInputs.orientation = "row";
    gInputs.alignChildren = ["left", "center"];
    gInputs.spacing = 16;

    // フレーム数
    var gFrames = gInputs.add("group");
    gFrames.orientation = "column";
    gFrames.alignChildren = ["left", "center"];
    var stFrames = gFrames.add("statictext", undefined, "フレーム数:");
    var edFrames = gFrames.add("edittext", undefined, "1");
    edFrames.characters = 6;

    // Step
    var gStep = gInputs.add("group");
    gStep.orientation = "column";
    gStep.alignChildren = ["left", "center"];
    var stStep = gStep.add("statictext", undefined, "Step:");
    var edStep = gStep.add("edittext", undefined, "1");
    edStep.characters = 6;

    // 対象（レイヤー / アニメーションカーブ）
    var gTarget = win.add("group");
    gTarget.orientation = "row";
    gTarget.alignChildren = ["left", "center"];
    gTarget.spacing = 12;

    var stTarget = gTarget.add("statictext", undefined, "対象:");
    var rbLayer  = gTarget.add("radiobutton", undefined, "レイヤー");
    var rbCurve  = gTarget.add("radiobutton", undefined, "アニメーションカーブ");

    rbLayer.value = true; // デフォルトは従来通りレイヤー
    rbLayer.helpTip = "選択レイヤーの開始時間(startTime)を階段状にずらします。";
    rbCurve.helpTip = "選択しているプロパティ（キー付き）のキー時刻を階段状にずらします。\n※カーブモードはレイヤー単位で同じオフセットを適用します（同レイヤー内の複数プロパティは同じ量で移動）。\nキーが選択されていればそのキーのみ、未選択ならそのプロパティの全キーを対象にします。";

    // ボタン行（A / B / C / D / E）
    var gBtns = win.add("group");
    gBtns.orientation = "row";
    gBtns.spacing = 8;
    gBtns.alignment = ["fill", "top"];

    function makeIconButton(img, label, tooltip) {
        var btn;
        if (img) {
            btn = gBtns.add("iconbutton", undefined, img, { style: "toolbutton" });
            btn.preferredSize = [24, 24]; // ← 1/2に縮小
        } else {
            btn = gBtns.add("button", undefined, label);
            btn.preferredSize = [64, 24];
        }
        btn.helpTip = tooltip || "";
        return btn;
    }

    var btnA = makeIconButton(iconA, "A", "A: 上から順に階段オフセット");
    var btnB = makeIconButton(iconB, "B", "B: 下から順に階段オフセット");
    var btnC = makeIconButton(iconC, "C", "C: ランダム順に階段オフセット");
    var btnD = makeIconButton(iconD, "D", "D: 左揃え（開始 / 最左キーに揃える）");
    var btnE = makeIconButton(iconE, "E", "E: 右揃え（終了 / 最右キーに揃える）");

    // --- コア処理 ---
    function parseIntSafe(s, defVal) {
        var n = parseInt(s, 10);
        return (isFinite(n) && !isNaN(n)) ? n : defVal;
    }
    function parseNumSafe(s, defVal) {
        var n = Number(s);
        return (isFinite(n) && !isNaN(n)) ? n : defVal;
    }

    function shuffleArray(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var r = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i]; arr[i] = arr[r]; arr[r] = tmp;
        }
        return arr;
    }

    function getOwnerLayerFromProperty(prop) {
        try {
            // propertyDepth の親を辿ると最終的に Layer に到達する
            var L = prop.propertyGroup(prop.propertyDepth);
            if (L && (L instanceof Layer)) return L;
        } catch (e) {}
        return null;
    }

    function buildPropertyPathIndices(prop) {
        // 同一レイヤー内での安定ソート用（Transform/Effects 内の順をだいたい維持）
        var idxs = [];
        try {
            var cur = prop;
            while (cur && !(cur instanceof Layer)) {
                if (cur.propertyIndex !== undefined) idxs.unshift(cur.propertyIndex);
                cur = cur.propertyGroup(1);
            }
        } catch (e) {}
        return idxs; // [int, int, ...]
    }

    function compareIntArray(a, b) {
        var n = Math.max(a.length, b.length);
        for (var i = 0; i < n; i++) {
            var av = (i < a.length) ? a[i] : -1;
            var bv = (i < b.length) ? b[i] : -1;
            if (av !== bv) return av - bv;
        }
        return 0;
    }

    function getSelectedCurveProperties(comp) {
        // 選択レイヤー配下の「選択プロパティ」から、キー付きPropertyだけを拾う（KeyOpeTool方式）
        // ※Comp.selectedProperties は PropertyGroup が混ざりやすいので使わない
        var out = [];
        if (!comp || !(comp instanceof CompItem)) return out;

        var layers = comp.selectedLayers;
        if (!layers || layers.length === 0) return out;

        for (var i = 0; i < layers.length; i++) {
            var L = layers[i];
            if (!L || L.locked) continue;

            var props = L.selectedProperties;
            if (!props || props.length === 0) continue;

            for (var j = 0; j < props.length; j++) {
                var p = props[j];
                if (!(p instanceof Property)) continue;

                // 時間変化しないプロパティは対象外
                if (p.canVaryOverTime !== undefined && !p.canVaryOverTime) continue;

                // キーが無い場合はスキップ
                if (!p.numKeys || p.numKeys < 1) continue;

                out.push(p);
            }
        }
        return out;
    }


    function getSelectedCurveTargetsByLayer(comp) {
        // 目的：アニメーションカーブモードでも「レイヤー順」を基準に適用する
        // 各レイヤーの selectedProperties から、キー付きPropertyだけを集めて {layer, props[]} を返す
        var targets = [];
        if (!comp || !(comp instanceof CompItem)) return targets;

        var layers = comp.selectedLayers;
        if (!layers || layers.length === 0) return targets;

        for (var i = 0; i < layers.length; i++) {
            var L = layers[i];
            if (!L || L.locked) continue;

            var props = L.selectedProperties;
            if (!props || props.length === 0) continue;

            var arr = [];
            for (var j = 0; j < props.length; j++) {
                var p = props[j];
                if (!(p instanceof Property)) continue;

                // 時間変化しないプロパティは対象外
                if (p.canVaryOverTime !== undefined && !p.canVaryOverTime) continue;

                // キーが無い場合はスキップ
                if (!p.numKeys || p.numKeys < 1) continue;

                arr.push(p);
            }

            if (arr.length === 0) continue;

            // 同一レイヤー内はプロパティパス順で安定ソート（Transform → Effects の順など）
            arr.sort(function (pa, pb) {
                var aPath = buildPropertyPathIndices(pa);
                var bPath = buildPropertyPathIndices(pb);
                return compareIntArray(aPath, bPath);
            });

            targets.push({ layer: L, props: arr });
        }

        return targets;
    }


    function offsetLayerStartTime(L, deltaSec, fps) {
        var newStart = L.startTime + deltaSec;
        newStart = Math.round(newStart * fps) / fps; // フレーム丸め
        L.startTime = newStart;
    }

    
    function isSpatialProperty(prop) {
        try {
            // PropertyValueType: TwoD_SPATIAL / ThreeD_SPATIAL など
            var t = prop.propertyValueType;
            return (t === PropertyValueType.TwoD_SPATIAL ||
                    t === PropertyValueType.ThreeD_SPATIAL ||
                    t === PropertyValueType.SHAPE);
        } catch (e) {
            return false;
        }
    }

    function cloneKeyData(prop, ki) {
        var d = {};
        // value
        try { d.value = prop.keyValue(ki); } catch (e) {}

        // interpolation
        try { d.inInterp = prop.keyInInterpolationType(ki); } catch (e) {}
        try { d.outInterp = prop.keyOutInterpolationType(ki); } catch (e) {}

        // temporal
        try { d.inEase = prop.keyInTemporalEase(ki); } catch (e) {}
        try { d.outEase = prop.keyOutTemporalEase(ki); } catch (e) {}
        try { d.temporalAutoBezier = prop.keyTemporalAutoBezier(ki); } catch (e) {}
        try { d.temporalContinuous = prop.keyTemporalContinuous(ki); } catch (e) {}

        // spatial (存在しないプロパティもあるので try/catch)
        try { d.spatialAutoBezier = prop.keySpatialAutoBezier(ki); } catch (e) {}
        try { d.spatialContinuous = prop.keySpatialContinuous(ki); } catch (e) {}
        try { d.inTangent = prop.keyInSpatialTangent(ki); } catch (e) {}
        try { d.outTangent = prop.keyOutSpatialTangent(ki); } catch (e) {}
        try { d.roving = prop.keyRoving(ki); } catch (e) {}

        // selected state
        try { d.selected = prop.keySelected(ki); } catch (e) {}

        return d;
    }

    function applyKeyData(prop, keyIndex, d) {
        // value
        try {
            if (d.value !== undefined && typeof prop.setValueAtKey === "function") {
                prop.setValueAtKey(keyIndex, d.value);
            }
        } catch (e) {}

        // interpolation
        try {
            if (d.inInterp !== undefined && d.outInterp !== undefined &&
                typeof prop.setInterpolationTypeAtKey === "function") {
                prop.setInterpolationTypeAtKey(keyIndex, d.inInterp, d.outInterp);
            }
        } catch (e) {}

        // temporal
        try {
            if (d.inEase !== undefined && d.outEase !== undefined &&
                typeof prop.setTemporalEaseAtKey === "function") {
                prop.setTemporalEaseAtKey(keyIndex, d.inEase, d.outEase);
            }
        } catch (e) {}

        try {
            if (d.temporalContinuous !== undefined &&
                typeof prop.setTemporalContinuousAtKey === "function") {
                prop.setTemporalContinuousAtKey(keyIndex, d.temporalContinuous);
            }
        } catch (e) {}

        try {
            if (d.temporalAutoBezier !== undefined &&
                typeof prop.setTemporalAutoBezierAtKey === "function") {
                prop.setTemporalAutoBezierAtKey(keyIndex, d.temporalAutoBezier);
            }
        } catch (e) {}

        // spatial
        try {
            if (d.roving !== undefined && typeof prop.setRovingAtKey === "function") {
                prop.setRovingAtKey(keyIndex, d.roving);
            }
        } catch (e) {}

        try {
            if (d.spatialContinuous !== undefined &&
                typeof prop.setSpatialContinuousAtKey === "function") {
                prop.setSpatialContinuousAtKey(keyIndex, d.spatialContinuous);
            }
        } catch (e) {}

        try {
            if (d.spatialAutoBezier !== undefined &&
                typeof prop.setSpatialAutoBezierAtKey === "function") {
                prop.setSpatialAutoBezierAtKey(keyIndex, d.spatialAutoBezier);
            }
        } catch (e) {}

        try {
            if (d.inTangent !== undefined && d.outTangent !== undefined &&
                typeof prop.setSpatialTangentsAtKey === "function") {
                prop.setSpatialTangentsAtKey(keyIndex, d.inTangent, d.outTangent);
            }
        } catch (e) {}

        // selection
        try {
            if (d.selected !== undefined && typeof prop.setSelectedAtKey === "function") {
                prop.setSelectedAtKey(keyIndex, d.selected);
            }
        } catch (e) {}
    }


    function offsetPropertyKeyTimes(prop, deltaSec, fps) {
        // 参考：AE_KeyOpeTool の「removeKey → setValueAtTime で再生成」方式（setKeyTime / addKey 非依存）
        if (!prop || !(prop instanceof Property)) return;
        if (prop.canVaryOverTime !== undefined && !prop.canVaryOverTime) return;
        if (!prop.numKeys || prop.numKeys < 1) return;

        var eps = 0.5 / fps; // 半フレーム許容

        function cloneEase(easeArr) {
            var out = [];
            if (!easeArr || !easeArr.length) return out;
            for (var i = 0; i < easeArr.length; i++) {
                var e = easeArr[i];
                try {
                    // influence は 0.1〜100 に収める（AEがエラーを吐くのを回避）
                    var infl = e.influence;
                    if (infl < 0.1) infl = 0.1;
                    if (infl > 100) infl = 100;
                    out.push(new KeyframeEase(e.speed, infl));
                } catch (ex) {}
            }
            return out;
        }

        function captureKeyData(k) {
            var d = {};
            d.time = prop.keyTime(k);
            d.value = prop.keyValue(k);
            d.easeIn = cloneEase(prop.keyInTemporalEase(k));
            d.easeOut = cloneEase(prop.keyOutTemporalEase(k));
            d.interpIn = prop.keyInInterpolationType(k);
            d.interpOut = prop.keyOutInterpolationType(k);
            d.continuous = prop.keyTemporalContinuous(k);
            d.autoBezier = prop.keyTemporalAutoBezier(k);
            d.selected = prop.keySelected(k);

            // spatial（Position等）
            try { d.roving = prop.keyRoving(k); } catch (e) {}
            try { d.spatialContinuous = prop.keySpatialContinuous(k); } catch (e) {}
            try { d.spatialAutoBezier = prop.keySpatialAutoBezier(k); } catch (e) {}
            try { d.inTangent = prop.keyInSpatialTangent(k); } catch (e) {}
            try { d.outTangent = prop.keyOutSpatialTangent(k); } catch (e) {}

            return d;
        }

        function applyKeyDataAtIndex(idx, d) {
            // interpolation
            try {
                prop.setInterpolationTypeAtKey(idx, d.interpIn, d.interpOut);
            } catch (e) {}

            var isHold = (d.interpIn === KeyframeInterpolationType.HOLD) || (d.interpOut === KeyframeInterpolationType.HOLD);
            var isBothLinear = (d.interpIn === KeyframeInterpolationType.LINEAR) && (d.interpOut === KeyframeInterpolationType.LINEAR);

            // temporal
            try {
                if (!isHold && !isBothLinear) {
                    if (typeof d.continuous !== "undefined") prop.setTemporalContinuousAtKey(idx, d.continuous);
                    prop.setTemporalAutoBezierAtKey(idx, false);
                    prop.setTemporalEaseAtKey(idx, d.easeIn, d.easeOut);
                }
                if (d.autoBezier && !isHold) {
                    prop.setTemporalAutoBezierAtKey(idx, true);
                }
            } catch (e) {}

            // spatial
            try { if (typeof d.roving !== "undefined") prop.setRovingAtKey(idx, d.roving); } catch (e) {}
            try { if (typeof d.spatialContinuous !== "undefined") prop.setSpatialContinuousAtKey(idx, d.spatialContinuous); } catch (e) {}
            try { if (typeof d.spatialAutoBezier !== "undefined") prop.setSpatialAutoBezierAtKey(idx, d.spatialAutoBezier); } catch (e) {}
            try {
                if (typeof d.inTangent !== "undefined" && typeof d.outTangent !== "undefined") {
                    prop.setSpatialTangentsAtKey(idx, d.inTangent, d.outTangent);
                }
            } catch (e) {}

            // selection
            try { prop.setSelectedAtKey(idx, !!d.selected); } catch (e) {}
        }

        // --- 対象キーの収集（キーが選択されていればそのキーのみ。無ければ全キー） ---
        var idxs = [];
        var anySel = false;
        try {
            for (var k = 1; k <= prop.numKeys; k++) {
                if (prop.keySelected(k)) {
                    idxs.push(k);
                    anySel = true;
                }
            }
        } catch (e) {}

        if (!anySel) {
            for (var k2 = 1; k2 <= prop.numKeys; k2++) idxs.push(k2);
        }

        if (idxs.length === 0) return;

        // タイムリマップを「全キー対象」で触る場合の保険（KeyOpeToolのダミーキー方式）
        var dummyTime = null;
        var dummyAdded = false;
        try {
            var needDummy = (prop.matchName === "ADBE Time Remapping") && (idxs.length === prop.numKeys) && (prop.numKeys > 0);
            if (needDummy) {
                var lastT = prop.keyTime(prop.numKeys);
                var lastV = prop.keyValue(prop.numKeys);
                dummyTime = lastT + (1 / fps / 100);
                prop.setValueAtTime(dummyTime, lastV);
                dummyAdded = true;
            }
        } catch (e) { dummyTime = null; dummyAdded = false; }

        // まず、移動対象のキー情報を保存
        var saved = [];
        for (var i = 0; i < idxs.length; i++) {
            try { saved.push(captureKeyData(idxs[i])); } catch (e) {}
        }
        if (saved.length === 0) {
            // ダミーだけ残ってしまうのを避ける
            if (dummyAdded && dummyTime !== null) {
                try {
                    var di = prop.nearestKeyIndex(dummyTime);
                    if (di && di >= 1 && di <= prop.numKeys && Math.abs(prop.keyTime(di) - dummyTime) <= eps) prop.removeKey(di);
                } catch (e) {}
            }
            return;
        }

        // キーを削除（降順）
        idxs.sort(function (a, b) { return b - a; });
        for (var r = 0; r < idxs.length; r++) {
            try { prop.removeKey(idxs[r]); } catch (e) {}
        }

        // 新しいキーを打ち直し
        for (var n = 0; n < saved.length; n++) {
            var d = saved[n];
            var newTime = d.time + deltaSec;
            newTime = Math.round(newTime * fps) / fps; // フレーム丸め

            try {
                // タイムリマップは必要なら有効化してから打つ（KeyOpeTool方式）
                if (prop.matchName === "ADBE Time Remapping") {
                    var lyr = prop.propertyGroup(prop.propertyDepth);
                    if (lyr instanceof AVLayer && !lyr.timeRemapEnabled) lyr.timeRemapEnabled = true;
                }

                prop.setValueAtTime(newTime, d.value);
                var idx = prop.nearestKeyIndex(newTime);
                if (!idx || idx < 1 || idx > prop.numKeys) continue;

                // 生成されたキーが想定時刻とズレている場合はスキップ（安全策）
                try {
                    var tchk = prop.keyTime(idx);
                    if (Math.abs(tchk - newTime) > eps) continue;
                } catch (e) {}

                applyKeyDataAtIndex(idx, d);
            } catch (e) {}
        }

        // ダミーキー除去
        if (dummyAdded && dummyTime !== null) {
            try {
                var di2 = prop.nearestKeyIndex(dummyTime);
                if (di2 && di2 >= 1 && di2 <= prop.numKeys && Math.abs(prop.keyTime(di2) - dummyTime) <= eps) {
                    prop.removeKey(di2);
                }
            } catch (e) {}
        }
    }

    
function applyOffset(mode) {
    var frames = parseNumSafe(edFrames.text, 0);
    var step   = Math.max(1, parseIntSafe(edStep.text, 1));
    if (frames === 0) {
        alert("フレーム数には 0 以外の数値を入力してください。");
        return;
    }

    // 実行時にだけ状態チェック
    if (!app.project) {
        alert("プロジェクトがありません。コンポを開いてから実行してください。");
        return;
    }
    var comp = app.project.activeItem;
    if (!(comp && comp instanceof CompItem)) {
        alert("アクティブなコンポがありません。タイムラインでコンポを選択してください。");
        return;
    }

    var fps = (comp.frameRate && comp.frameRate > 0) ? comp.frameRate : 30;

    var targetLabel = rbLayer.value ? "Layer" : "Curve";

    // 対象の取得
    var items = [];
    var isLayerMode = rbLayer.value;

    if (isLayerMode) {
        if (!comp.selectedLayers || comp.selectedLayers.length === 0) {
            alert("ずらしたいレイヤーを選択してから実行してください。");
            return;
        }
        items = comp.selectedLayers.slice(0); // Layer[]
    } else {
        // カーブモード：レイヤー単位でまとめる（レイヤー順がそのまま適用順になる）
        items = getSelectedCurveTargetsByLayer(comp); // [{layer:Layer, props:Property[]}, ...]
        if (!items || items.length === 0) {
            alert("アニメーションカーブ（キー付きプロパティ）を選択してから実行してください。");
            return;
        }
    }

    // 並びの決定
    if (mode === "C") {
        // ランダムは「レイヤー（またはレイヤーグループ）」単位でシャッフル
        shuffleArray(items);
    } else {
        if (isLayerMode) {
            items.sort(function (a, b) {
                // A:上→下(小→大), B:下→上(大→小)
                return (mode === "A") ? (a.index - b.index) : (b.index - a.index);
            });
        } else {
            // Curve targets: layerIndex のみで並べる（レイヤー順を最優先）
            items.sort(function (ta, tb) {
                var la = ta.layer;
                var lb = tb.layer;
                var ia = la ? la.index : 0;
                var ib = lb ? lb.index : 0;
                return (mode === "A") ? (ia - ib) : (ib - ia);
            });
        }
    }

    app.beginUndoGroup("Sequencer Offset (" + mode + ") [" + targetLabel + "]");

    try {
        var applied = 0; // スキップがあるので別カウント（カーブモードは「レイヤー」単位でカウント）
        for (var i = 0; i < items.length; i++) {
            // step 個ごとに増分を進める
            var groupIndex = Math.floor(applied / step);
            var deltaSec   = (frames * groupIndex) / fps;

            if (isLayerMode) {
                var L = items[i];
                if (!L || L.locked) continue;
                offsetLayerStartTime(L, deltaSec, fps);
            } else {
                // ここが今回の要点：レイヤー単位で同じオフセットを、そのレイヤーの選択カーブ全てに適用
                var T = items[i]; // {layer, props}
                if (!T || !T.layer || T.layer.locked) continue;

                var props = T.props;
                if (props && props.length > 0) {
                    for (var p = 0; p < props.length; p++) {
                        offsetPropertyKeyTimes(props[p], deltaSec, fps);
                    }
                }
            }

            applied++;
        }
    } catch (e) {
        alert("処理中にエラー:\n" + e.toString());
    } finally {
        app.endUndoGroup();
    }
}


    // --- 揃える（左揃え / 右揃え） ---
    function getPropKeyMinMax(prop, fps) {
        // prop内の「対象キー」(キー選択があればそれのみ、無ければ全キー) の min/max time を返す
        if (!prop || !(prop instanceof Property)) return null;
        if (!prop.numKeys || prop.numKeys < 1) return null;

        var eps = 0.5 / fps;
        var anySel = false;
        var minT = null, maxT = null;

        try {
            for (var k = 1; k <= prop.numKeys; k++) {
                if (prop.keySelected(k)) {
                    var t = prop.keyTime(k);
                    if (minT === null || t < minT) minT = t;
                    if (maxT === null || t > maxT) maxT = t;
                    anySel = true;
                }
            }
        } catch (e) {}

        if (!anySel) {
            for (var k2 = 1; k2 <= prop.numKeys; k2++) {
                var t2 = prop.keyTime(k2);
                if (minT === null || t2 < minT) minT = t2;
                if (maxT === null || t2 > maxT) maxT = t2;
            }
        }

        if (minT === null || maxT === null) return null;
        return { min: minT, max: maxT };
    }

    function getLayerKeysMinMax(target, fps) {
        // target: {layer: Layer, props: Property[]}
        if (!target || !target.layer || !target.props || target.props.length === 0) return null;

        var minT = null, maxT = null;
        for (var i = 0; i < target.props.length; i++) {
            var mm = getPropKeyMinMax(target.props[i], fps);
            if (!mm) continue;
            if (minT === null || mm.min < minT) minT = mm.min;
            if (maxT === null || mm.max > maxT) maxT = mm.max;
        }
        if (minT === null || maxT === null) return null;
        return { min: minT, max: maxT };
    }

    function applyAlign(mode) {
        // mode "D"=左揃え, "E"=右揃え
        if (!app.project) {
            alert("プロジェクトがありません。コンポを開いてから実行してください。");
            return;
        }
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            alert("アクティブなコンポがありません。タイムラインでコンポを選択してください。");
            return;
        }

        var fps = (comp.frameRate && comp.frameRate > 0) ? comp.frameRate : 30;
        var isLayerMode = rbLayer.value;
        var targetLabel = isLayerMode ? "Layer" : "Curve";

        app.beginUndoGroup("Sequencer Align (" + mode + ") [" + targetLabel + "]");

        try {
            if (isLayerMode) {
                // --- レイヤー揃え ---
                var layers = comp.selectedLayers;
                if (!layers || layers.length === 0) {
                    alert("揃えたいレイヤーを選択してから実行してください。");
                    return;
                }

                var minStart = null;
                var maxOut = null;

                for (var i = 0; i < layers.length; i++) {
                    var L = layers[i];
                    if (!L || L.locked) continue;

                    if (minStart === null || L.startTime < minStart) minStart = L.startTime;
                    if (maxOut === null || L.outPoint > maxOut) maxOut = L.outPoint;
                }

                if (minStart === null || maxOut === null) {
                    alert("対象レイヤーがありません（ロックされている可能性があります）。");
                    return;
                }

                for (var j = 0; j < layers.length; j++) {
                    var LL = layers[j];
                    if (!LL || LL.locked) continue;

                    var deltaSec;
                    if (mode === "D") {
                        // 左揃え：開始をそろえる
                        deltaSec = minStart - LL.startTime;
                    } else {
                        // 右揃え：終了(outPoint)をそろえる
                        deltaSec = maxOut - LL.outPoint;
                    }
                    if (deltaSec !== 0) offsetLayerStartTime(LL, deltaSec, fps);
                }
            } else {
                // --- カーブ揃え（レイヤー単位で移動量を決める） ---
                var targets = getSelectedCurveTargetsByLayer(comp); // [{layer, props}, ...]
                if (!targets || targets.length === 0) {
                    alert("アニメーションカーブ（キー付きプロパティ）を選択してから実行してください。");
                    return;
                }

                // 各レイヤーの「左端/右端キー」を集計
                var globalMin = null;
                var globalMax = null;
                var layerMM = []; // {target, min, max}

                for (var t = 0; t < targets.length; t++) {
                    var mm = getLayerKeysMinMax(targets[t], fps);
                    if (!mm) continue;

                    layerMM.push({ target: targets[t], min: mm.min, max: mm.max });

                    if (globalMin === null || mm.min < globalMin) globalMin = mm.min;
                    if (globalMax === null || mm.max > globalMax) globalMax = mm.max;
                }

                if (layerMM.length === 0 || globalMin === null || globalMax === null) {
                    alert("対象となるキーが見つかりませんでした。キーが付いたプロパティを選択してください。");
                    return;
                }

                // レイヤーごとに delta を決めて、そのレイヤー内の選択カーブをまとめて移動
                for (var u = 0; u < layerMM.length; u++) {
                    var rec = layerMM[u];
                    var delta = (mode === "D") ? (globalMin - rec.min) : (globalMax - rec.max);

                    if (delta === 0) continue;

                    var props = rec.target.props;
                    for (var p = 0; p < props.length; p++) {
                        offsetPropertyKeyTimes(props[p], delta, fps);
                    }
                }
            }
        } catch (e) {
            alert("処理中にエラー:\n" + e.toString());
        } finally {
            app.endUndoGroup();
        }
    }



    // クリックイベント

    btnA.onClick = function () { applyOffset("A"); };
    btnB.onClick = function () { applyOffset("B"); };
    btnC.onClick = function () { applyOffset("C"); };
    btnD.onClick = function () { applyAlign("D"); };
    btnE.onClick = function () { applyAlign("E"); };

    // 表示
    win.layout.layout(true);
    win.center();
    win.show();
})();
