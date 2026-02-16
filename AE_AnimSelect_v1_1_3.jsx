﻿/*  AnimProp Select
    - 選択レイヤーのアニメーション付きプロパティを内部スキャン（一覧表示なし）
    - カテゴリボタンでプロパティ選択
    - カーソルフレームのキー選択（±Nフレーム範囲指定）
    - 次元分割（Position/Anchor/Scale の X/Y/Z）にも対応
    - ★「わざとエクスプレッションエラー」を仕込んで「エクスプレッションエラーを表示」でタイムライン展開に対応
*/
(function AnimPropSelect(thisObj) {

    var SCRIPT_NAME = "AnimProp Select";

    var state = {
        includeKeys: true,
        includeExpr: true,
        clearBeforeSelect: true,

        // ★表示／選択
        revealInTimeline: true,
        doSelectProps: true,

        selectKeysAtCursor: false,
        cursorKeyRangeFrames: 0, // ±Nフレーム（0=同フレームのみ）

        // ★キー追加（カーソルにキーフレームを打つ）
        addKeyAtCursor: false,

        // ★直前に表示したカテゴリの“ファミリー”（位置→位置Xで畳まれる対策用）
        lastRevealFamily: null,


        // ★展開の追加表示（維持）用メモリ（レイヤー別）
        // 既存選択をクリア=OFF のとき、過去にこのスクリプトで展開したプロパティも一緒に再展開して維持します。
        revealMemory: {},
        items: [],
        comp: null,
        layers: []
    };

    // ---------- 基本 ----------
    function getActiveComp() {
        var it = app.project ? app.project.activeItem : null;
        return (it && it instanceof CompItem) ? it : null;
    }

    function getSelectedLayers(comp) {
        if (!comp) return [];
        try { return comp.selectedLayers || []; } catch (e) { return []; }
    }

    function clampInt(n, minV, maxV, fallback) {
        var v = parseInt(n, 10);
        if (isNaN(v)) return fallback;
        if (v < minV) return minV;
        if (v > maxV) return maxV;
        return v;
    }

    function getFrameDuration(comp) {
        var fd = 0;
        try { fd = comp.frameDuration; } catch (e0) { fd = 0; }
        if (!fd || fd <= 0) fd = 1 / 30;
        return fd;
    }

    function timeToFrame(timeSec, fd) {
        return Math.round(timeSec / fd);
    }

    function isAnimated(prop) {
        var hasKey = false;
        var hasExpr = false;

        // カーソルキー選択ONの時は、キー判定を強制で含める
        var keysEnabledForScan = state.includeKeys || state.selectKeysAtCursor;

        if (keysEnabledForScan) {
            try { hasKey = (prop.numKeys !== undefined && prop.numKeys > 0); } catch (e) { hasKey = false; }
        }
        if (state.includeExpr && prop.canSetExpression) {
            try {
                var expr = "";
                try { expr = prop.expression; } catch (e1) { expr = ""; }
                hasExpr = !!prop.expressionEnabled && String(expr).replace(/\s+/g, "").length > 0;
            } catch (e2) { hasExpr = false; }
        }
        return hasKey || hasExpr;
    }

    // ★ここを強化：次元分割後の matchName もカテゴリ別に分類
    function classifyProp(prop) {
        var m = "";
        try { m = prop.matchName; } catch (e0) { m = ""; }

        // ---- Transform: Position (separated dims対応) ----
        if (m === "ADBE Position_0") return "PositionX";
        if (m === "ADBE Position_1") return "PositionY";
        if (m === "ADBE Position_2") return "PositionZ";
        if (m === "ADBE Position") return "Position";

        // ---- Transform: Anchor Point (separated dims対応) ----
        if (m === "ADBE Anchor Point_0") return "AnchorPointX";
        if (m === "ADBE Anchor Point_1") return "AnchorPointY";
        if (m === "ADBE Anchor Point_2") return "AnchorPointZ";
        if (m === "ADBE Anchor Point") return "AnchorPoint";

        // ---- Transform: Scale (separated dims対応) ----
        if (m === "ADBE Scale_0") return "ScaleX";
        if (m === "ADBE Scale_1") return "ScaleY";
        if (m === "ADBE Scale_2") return "ScaleZ";
        if (m === "ADBE Scale") return "Scale";

        // ---- Transform: Opacity ----
        if (m === "ADBE Opacity") return "Opacity";

        // ---- Rotation (3D: X/Y/Z, 2D: Z) ----
        if (m === "ADBE Rotate X") return "RotationX";
        if (m === "ADBE Rotate Y") return "RotationY";
        if (m === "ADBE Rotate Z") return "RotationZ";

        // ---- Others ----
        if (m === "ADBE Orientation") return "Orientation";
        if (m === "ADBE Audio Levels") return "AudioLevels";
        if (m === "ADBE Point of Interest") return "PointOfInterest";

        // 親グループから推定
        var p = prop;
        for (var i = 0; i < 12; i++) {
            var parent = null;
            try { parent = p.parentProperty; } catch (e1) { parent = null; }
            if (!parent) { try { parent = p.propertyGroup(1); } catch (e2) { parent = null; } }
            if (!parent) break;

            var pmn = "";
            try { pmn = parent.matchName; } catch (e3) { pmn = ""; }

            if (pmn === "ADBE Effect Parade") return "Effect";
            if (pmn === "ADBE Mask Parade") return "Mask";
            if (pmn === "ADBE Text Properties") return "Text";
            if (pmn === "ADBE Root Vectors Group") return "Shape";

            p = parent;
        }
        return "Other";
    }

    function scan() {
        state.comp = getActiveComp();
        state.layers = getSelectedLayers(state.comp);
        state.items = [];

        if (!state.comp || state.layers.length === 0) return;

        function walk(layer, group) {
            var n = 0;
            try { n = group.numProperties; } catch (e) { n = 0; }
            for (var i = 1; i <= n; i++) {
                var p = null;
                try { p = group.property(i); } catch (e2) { p = null; }
                if (!p) continue;

                var pt = null;
                try { pt = p.propertyType; } catch (e3) { pt = null; }

                // leafプロパティ
                if (pt === PropertyType.PROPERTY) {
                    if (isAnimated(p)) {
                        state.items.push({
                            layer: layer,
                            prop: p,
                            category: classifyProp(p)
                        });
                    }
                }

                // ★次元分割などで「PROPERTYなのに子を持つ」ケースに備えて、
                // numProperties があれば常に潜る
                var subN = 0;
                try { subN = p.numProperties; } catch (e4) { subN = 0; }
                if (subN && subN > 0) {
                    walk(layer, p);
                } else if (pt !== PropertyType.PROPERTY) {
                    walk(layer, p);
                }
            }
        }

        for (var l = 0; l < state.layers.length; l++) {
            walk(state.layers[l], state.layers[l]);
        }
    }

    function clearPropertySelection() {
        function walk(group) {
            var n = 0;
            try { n = group.numProperties; } catch (e) { n = 0; }
            for (var i = 1; i <= n; i++) {
                var p = null;
                try { p = group.property(i); } catch (e2) { p = null; }
                if (!p) continue;

                var pt = null;
                try { pt = p.propertyType; } catch (e3) { pt = null; }

                if (pt === PropertyType.PROPERTY) {
                    // ★selected=false を無条件に叩くと、タイムラインの開閉状態が崩れることがあるため
                    // 既に選択されているものだけ解除する
                    var wasSel = false;
                    try { wasSel = !!p.selected; } catch (e4) { wasSel = false; }
                    if (wasSel) {
                        try { p.selected = false; } catch (e5) {}
                    }
                }

                var subN = 0;
                try { subN = p.numProperties; } catch (e6) { subN = 0; }
                if (subN && subN > 0) {
                    walk(p);
                } else if (pt !== PropertyType.PROPERTY) {
                    walk(p);
                }
            }
        }
        for (var i = 0; i < state.layers.length; i++) {
            walk(state.layers[i]);
        }
    }

    // カーソルフレームのキー“だけ”を選択
    function selectKeysAtCursor(items) {
        if (!state.comp) return;
        if (!items || items.length === 0) return;

        var fd = getFrameDuration(state.comp);

        var baseTime = 0;
        try { baseTime = state.comp.time; } catch (e0) { baseTime = 0; }

        var baseFrame = timeToFrame(baseTime, fd);
        var range = clampInt(state.cursorKeyRangeFrames, 0, 9999, 0);

        for (var i = 0; i < items.length; i++) {
            var p = items[i].prop;
            if (!p) continue;

            var nk = 0;
            try { nk = p.numKeys; } catch (e1) { nk = 0; }
            if (!nk || nk <= 0) continue;

            var canSel = false;
            try { canSel = (typeof p.setSelectedAtKey === "function"); } catch (e2) { canSel = false; }
            if (!canSel) continue;

            // このプロパティのキー選択を一旦全解除
            for (var k0 = 1; k0 <= nk; k0++) {
                try { p.setSelectedAtKey(k0, false); } catch (e3) {}
            }

            // 該当フレーム（±range）だけ選択
            for (var k = 1; k <= nk; k++) {
                var kt = 0;
                try { kt = p.keyTime(k); } catch (e4) { continue; }

                var kFrame = timeToFrame(kt, fd);
                if (Math.abs(kFrame - baseFrame) <= range) {
                    try { p.setSelectedAtKey(k, true); } catch (e5) {}
                }
            }
        }
    }

    // ---------- 「わざとエクスプレッションエラー」でタイムライン展開 ----------
    function getRevealExpressionErrorsCommandId() {
        // まずメニュー文字列で解決（英語/日本語）
        var names = [
            "Reveal Expression Errors",
            "エクスプレッションエラーを表示"
        ];
        for (var i = 0; i < names.length; i++) {
            var id = 0;
            try { id = app.findMenuCommandId(names[i]); } catch (e) { id = 0; }
            if (id && id !== 0 && id !== -1) return id;
        }

        // フォールバック（環境によりここが効くことがある）
        // -15663127 は複数のMenuIDリストで確認されている値
        return -15663127;
    }

    // ★選択したプロパティをタイムラインに表示（SS相当）※環境で見つからない場合はフォールバック
    function getRevealSelectedPropertiesCommandId() {
        var names = [
            "Reveal Selected Properties",
            "選択したプロパティを表示"
        ];
        for (var i = 0; i < names.length; i++) {
            var id = 0;
            try { id = app.findMenuCommandId(names[i]); } catch (e) { id = 0; }
            if (id && id !== 0 && id !== -1) return id;
        }
        return 0;
    }

    function tryRevealSelectedProperties() {
        var cmd = getRevealSelectedPropertiesCommandId();
        if (!cmd) return false;

        // ★プロパティ選択がUIに反映されるまで待つ（環境差対策）
        try { $.sleep(120); } catch (e0) {}

        // ★1回目で畳まれて終わる環境があるので、短い間隔で複数回実行する
        for (var i = 0; i < 2; i++) {
            try { app.executeCommand(cmd); } catch (e1) {}
            try { $.sleep(80); } catch (e2) {}
        }
        return true;
    }


    
    function addKeyframesAtCursor(items) {
        if (!state.comp) return;
        if (!items || items.length === 0) return;

        var t = 0;
        try { t = state.comp.time; } catch (e0) { t = 0; }

        // items からユニークな実プロパティを取り直してキーを打つ
        var pairs = uniquePairsFromItems(items);
        var props = pairsToProps(pairs);

        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            if (!p) continue;

            var canVary = true;
            try { canVary = !!p.canVaryOverTime; } catch (e1) { canVary = true; }
            if (!canVary) continue;

            var v = null;
            try {
                // 可能なら “見た目” に近い値（式込み）を取得
                v = p.valueAtTime(t, false);
            } catch (e2) {
                try { v = p.value; } catch (e3) { v = null; }
            }
            if (v === null || typeof v === "undefined") continue;

            try { p.setValueAtTime(t, v); } catch (e4) {}
        }
    }

    function revealPropsByExpressionError(props) {
        if (!props || props.length === 0) return;

        var originals = [];

        var evalTime = 0;
        try { evalTime = (state.comp && state.comp instanceof CompItem) ? state.comp.time : 0; } catch (eT) { evalTime = 0; }

        // 一瞬だけエラー式を入れる（後で必ず元に戻す）
        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            if (!p) continue;

            var canExpr = false;
            try { canExpr = p.canSetExpression; } catch (e0) { canExpr = false; }
            if (!canExpr) continue;

            var expr = "";
            var enabled = false;
            try { expr = p.expression; } catch (e1) { expr = ""; }
            try { enabled = p.expressionEnabled; } catch (e2) { enabled = false; }

            originals.push({ prop: p, expr: expr, enabled: enabled });

            try {
                p.expression = "1/0";
                p.expressionEnabled = true;

                // ★即座に評価を走らせて「エラー状態」を確定させる（1回目で展開されない問題の対策）
                try { p.valueAtTime(evalTime, false); } catch (eEval) {}
            } catch (e3) {}
        }

        if (originals.length === 0) return;

        // UIがエラー状態を掴むまで少し待つ
        try { $.sleep(120); } catch (eWait) {}

        var cmd = getRevealExpressionErrorsCommandId();

        // ★1回目で反映されない環境があるので、短い間隔で複数回実行する
        for (var t = 0; t < 3; t++) {
            try { app.executeCommand(cmd); } catch (e4) {}
            try { $.sleep(80); } catch (e5) {}
        }

        // 復元
        for (var j = 0; j < originals.length; j++) {
            var o = originals[j];
            try {
                o.prop.expression = o.expr;
                o.prop.expressionEnabled = o.enabled;
            } catch (e6) {}
        }
    }

    function uniquePropsFromItems(items) {
        var out = [];
        var seen = {};
        for (var i = 0; i < items.length; i++) {
            var p = items[i].prop;
            var ly = items[i].layer;
            if (!p) continue;

            // ★同じプロパティ構造（propertyIndex等）はレイヤーごとに共通なので
            // レイヤー情報をキーに含めないと、複数レイヤーが1つに間引かれてしまう
            var layerKey = "";
            try { layerKey = ly ? String(ly.index) : "noLayer"; } catch (e0) { layerKey = "noLayer"; }

            var key = "";
            try { key = layerKey + "|" + p.propertyIndex + "|" + p.matchName + "|" + p.name; } catch (e) { key = layerKey + "|" + String(i); }
            if (seen[key]) continue;
            seen[key] = true;
            out.push(p);
        }
        return out;
    }

    // ---------- 展開維持（追加表示）用：プロパティのパス化 ----------
    function getSelectedLayerIndexMap() {
        var map = {};
        if (!state.layers) return map;
        for (var i = 0; i < state.layers.length; i++) {
            try { map[state.layers[i].index] = true; } catch (e0) {}
        }
        return map;
    }

    function getPropIndexPath(prop) {
        // layer直下から対象プロパティまでの propertyIndex チェーン（例: "2.1.5"）
        // ※UIの展開状態は取得できないため、後で同じプロパティを取り直すための識別子として使う
        var path = [];
        var p = prop;

        while (p) {
            var idx = 0;
            try { idx = p.propertyIndex; } catch (e0) { break; }
            path.unshift(idx);

            var parent = null;
            try { parent = p.parentProperty; } catch (e1) { parent = null; }

            // parent がレイヤー等（propertyIndex を持たない）の場合はここで止める
            var parentHasIndex = false;
            try { parentHasIndex = (parent && parent.propertyIndex !== undefined); } catch (e2) { parentHasIndex = false; }
            if (!parentHasIndex) break;

            p = parent;
        }
        return path;
    }

    function propPathToString(pathArr) {
        if (!pathArr || pathArr.length === 0) return "";
        return pathArr.join(".");
    }

    function propPathFromString(pathStr) {
        if (!pathStr) return [];
        var parts = String(pathStr).split(".");
        var out = [];
        for (var i = 0; i < parts.length; i++) {
            var v = parseInt(parts[i], 10);
            if (!isNaN(v)) out.push(v);
        }
        return out;
    }

    function getPropByIndexPath(layer, pathArr) {
        if (!layer || !pathArr || pathArr.length === 0) return null;
        var p = layer;
        for (var i = 0; i < pathArr.length; i++) {
            try { p = p.property(pathArr[i]); } catch (e0) { return null; }
            if (!p) return null;
        }
        return p;
    }

    function uniquePairsFromItems(items) {
        // items[] から { layerIndex, pathStr, layer, prop } のユニーク配列を作る
        var out = [];
        var seen = {};
        for (var i = 0; i < items.length; i++) {
            var p = items[i].prop;
            var ly = items[i].layer;
            if (!p || !ly) continue;

            var pathStr = "";
            try { pathStr = propPathToString(getPropIndexPath(p)); } catch (e0) { pathStr = ""; }
            if (!pathStr) continue;

            var key = "";
            try { key = String(ly.index) + ":" + pathStr; } catch (e1) { key = String(i); }
            if (seen[key]) continue;
            seen[key] = true;

            out.push({
                layerIndex: ly.index,
                pathStr: pathStr,
                layer: ly,
                prop: p
            });
        }
        return out;
    }

    function mergeRevealMemory(newPairs) {
        // 既存選択をクリア=OFF のとき、前回までに展開したものも保持して「追加で展開」するためのユニオンを作る
        var selMap = getSelectedLayerIndexMap();

        // memory をまずフィルタ（現在選択レイヤー以外は使わない）
        var merged = {};
        for (var k in state.revealMemory) {
            if (!state.revealMemory.hasOwnProperty(k)) continue;
            var e = state.revealMemory[k];
            if (!e) continue;
            if (selMap[e.layerIndex] !== true) continue;
            merged[k] = e;
        }

        // newPairs を足す
        for (var i = 0; i < newPairs.length; i++) {
            var np = newPairs[i];
            if (!np) continue;
            if (selMap[np.layerIndex] !== true) continue;

            var key = String(np.layerIndex) + ":" + String(np.pathStr);
            merged[key] = { layerIndex: np.layerIndex, pathStr: np.pathStr };
        }

        // memory 更新（大きくなりすぎるのを防ぐ：上限を超えたら今回選択レイヤー分だけに絞る）
        state.revealMemory = merged;
        var count = 0;
        for (var kk in state.revealMemory) { if (state.revealMemory.hasOwnProperty(kk)) count++; }
        if (count > 300) {
            // いったん今回選択レイヤーの分だけ残す
            var slim = {};
            for (var k2 in merged) {
                if (!merged.hasOwnProperty(k2)) continue;
                var e2 = merged[k2];
                if (e2 && selMap[e2.layerIndex] === true) slim[k2] = e2;
            }
            state.revealMemory = slim;
        }

        // merged を pairs に戻す（prop は後で取り直す）
        var outPairs = [];
        for (var k3 in merged) {
            if (!merged.hasOwnProperty(k3)) continue;
            outPairs.push(merged[k3]);
        }
        return outPairs;
    }

    function resetRevealMemory(newPairs) {
        // 既存選択をクリア=ON のときは、今回の表示だけをメモリにする（追加表示ではなく差し替え）
        var selMap = getSelectedLayerIndexMap();
        var mem = {};
        for (var i = 0; i < newPairs.length; i++) {
            var np = newPairs[i];
            if (!np) continue;
            if (selMap[np.layerIndex] !== true) continue;
            var key = String(np.layerIndex) + ":" + String(np.pathStr);
            mem[key] = { layerIndex: np.layerIndex, pathStr: np.pathStr };
        }
        state.revealMemory = mem;
    }

    function pairsToProps(pairs) {
        // pairs({layerIndex, pathStr}) から実プロパティ配列へ（現在の comp から取り直す）
        var props = [];
        if (!state.comp || !pairs) return props;

        for (var i = 0; i < pairs.length; i++) {
            var e = pairs[i];
            if (!e) continue;

            var layer = null;
            try { layer = state.comp.layer(e.layerIndex); } catch (e0) { layer = null; }
            if (!layer) continue;

            var pathArr = propPathFromString(e.pathStr);
            var p = getPropByIndexPath(layer, pathArr);
            if (!p) continue;

            props.push(p);
        }
        return props;
    }




    function isCatMatch(itemCat, requestCat) {
        // 「回転」ボタンは RotationX/Y/Z をまとめて扱う
        if (requestCat === "Rotation") {
            return (itemCat === "RotationX" || itemCat === "RotationY" || itemCat === "RotationZ");
        }
        // 「位置」ボタンは Position（非分割）と PositionX/Y/Z をまとめて扱う
        if (requestCat === "Position") {
            return (itemCat === "Position" || itemCat === "PositionX" || itemCat === "PositionY" || itemCat === "PositionZ");
        }
        // 「スケール」ボタンは Scale（非分割）と ScaleX/Y/Z をまとめて扱う
        if (requestCat === "Scale") {
            return (itemCat === "Scale" || itemCat === "ScaleX" || itemCat === "ScaleY" || itemCat === "ScaleZ");
        }
        // 「アンカー」ボタンは AnchorPoint（非分割）と AnchorPointX/Y/Z をまとめて扱う
        if (requestCat === "AnchorPoint") {
            return (itemCat === "AnchorPoint" || itemCat === "AnchorPointX" || itemCat === "AnchorPointY" || itemCat === "AnchorPointZ");
        }
        return (itemCat === requestCat);
    }

    
    function getCategoryFamily(cat) {
        // 位置系
        if (cat === "Position" || cat === "PositionX" || cat === "PositionY" || cat === "PositionZ") return "Position";
        // 回転系
        if (cat === "Rotation" || cat === "RotationX" || cat === "RotationY" || cat === "RotationZ") return "Rotation";
        // スケール系
        if (cat === "Scale" || cat === "ScaleX" || cat === "ScaleY" || cat === "ScaleZ") return "Scale";
        // アンカー系
        if (cat === "AnchorPoint" || cat === "AnchorPointX" || cat === "AnchorPointY" || cat === "AnchorPointZ") return "AnchorPoint";
        // 単独
        if (cat === "Opacity") return "Opacity";
        if (cat === "Orientation") return "Orientation";
        if (cat === "PointOfInterest") return "PointOfInterest";
        if (cat === "AudioLevels") return "AudioLevels";
        if (cat === "Mask") return "Mask";
        if (cat === "Effect") return "Effect";
        if (cat === "Shape") return "Shape";
        if (cat === "Text") return "Text";
        if (cat === "Other") return "Other";
        if (cat === "All") return "All";
        return "Other";
    }

    function getNeutralPropForFamily(layer, family) {
        // “同系統→同系統”で畳まれるのを避けるため、必ず違う系統のプロパティを一瞬だけ表示する
        var t = null;
        try { t = layer.property("ADBE Transform Group"); } catch (e0) { t = null; }
        if (!t) return null;

        // 基本は Opacity（必ず存在し、軽い）
        if (family !== "Opacity") {
            try { return t.property("ADBE Opacity"); } catch (e1) { return null; }
        }

        // 対象が Opacity の場合は Position を中継にする
        try { return t.property("ADBE Position"); } catch (e2) { return null; }
    }

    function forceRevealWithBuffer(targetProps, family) {
        // 同一ファミリー内での再表示（例：位置 → 位置X）で、
        // 1回目が“全閉じ”になってしまう環境がある。
        // そこで「別ファミリーの表示」を1回挟んで、AEの“表示トグル状態”をリセットする。
        if (!state.layers || state.layers.length === 0) return false;

        var neutralProp = getNeutralPropForFamily(state.layers[0], family);
        if (!neutralProp) return false;

        // まず“中継”表示（選択したプロパティを表示 があればそれを使う）
        var cmdSS = getRevealSelectedPropertiesCommandId();
        var useSS = (cmdSS && cmdSS !== 0 && cmdSS !== -1);

        if (useSS) {
            // target を一旦外して neutral のみを選択 → 表示 → target を戻して表示
            var prevNeutralSel = false;
            try { prevNeutralSel = !!neutralProp.selected; } catch (e0) { prevNeutralSel = false; }

            // target props の選択状態を退避して外す
            var prevSel = [];
            for (var i = 0; i < targetProps.length; i++) {
                var p = targetProps[i];
                var was = false;
                try { was = !!p.selected; } catch (e1) { was = false; }
                prevSel.push(was);
                if (was) { try { p.selected = false; } catch (e2) {} }
            }

            try { neutralProp.selected = true; } catch (e3) {}

            // 中継の表示
            try { $.sleep(60); } catch (e4) {}
            try { app.executeCommand(cmdSS); } catch (e5) {}
            try { $.sleep(80); } catch (e6) {}

            // neutral を元に戻す
            try { neutralProp.selected = prevNeutralSel; } catch (e7) {}

            // target props を復帰
            for (var j = 0; j < targetProps.length; j++) {
                try { targetProps[j].selected = prevSel[j]; } catch (e8) {}
            }

            // ここでは “中継表示”だけ行ったので true
            return true;
        }

        // SS が無い場合は、エラー表示で中継を挟む（重いが確実）
        revealPropsByExpressionError([neutralProp]);
        return true;
    }

    function selectByCategory(cat) {
        scan();
        if (!state.comp || state.layers.length === 0) return;

        var undoOpened = false;

        try {
            app.beginUndoGroup(SCRIPT_NAME);
            undoOpened = true;

        // 選択の初期化（既存選択をクリア）
        if (state.doSelectProps && state.clearBeforeSelect) {
            clearPropertySelection();
        }

        var targets = [];
        for (var i = 0; i < state.items.length; i++) {
            var it = state.items[i];
            if (cat === "All" || isCatMatch(it.category, cat)) {
                targets.push(it);

                if (state.doSelectProps) {
                    try { it.layer.selected = true; } catch (e1) {}
                    try { it.prop.selected = true; } catch (e2) {}
                }
            }
        }

        if (targets.length === 0) {
            alert(
                "対象が見つかりませんでした。\n\n" +
                "確認ポイント：\n" +
                "・レイヤーを選択している\n" +
                "・対象プロパティにキーフレーム/式がある\n" +
                "・位置X/Y/Zは「次元を分割」済み\n" +
                "・回転X/Yは「3Dレイヤー」化済み"
            );
            return;
        }

        if (state.addKeyAtCursor) {
            addKeyframesAtCursor(targets);
        }

        if (state.selectKeysAtCursor) {
            selectKeysAtCursor(targets);
        }

        if (state.revealInTimeline) {
            // ★同一ファミリー内（例：位置 → 位置X）での“再表示”は、
            // 環境によって 1回目が全閉じ → 2回目で展開 になりやすい。
            // 直前の表示ファミリーと同じなら、一瞬だけ別ファミリーの表示を挟んでトグル状態をリセットする。
            var newFamily = getCategoryFamily(cat);
            var needBuffer = (state.lastRevealFamily !== null && state.lastRevealFamily === newFamily);

            // ★選択/式の反映待ち（UI同期の遅れ対策）
            try { $.sleep(120); } catch (eRT) {}

            // ---- 「追加で展開」モード ----
            // 既存選択をクリア=OFF のときは、前回までにこのスクリプトで展開したプロパティも
            // 一緒に“再展開”して、タイムライン上で維持する（＝押したボタン分を追加展開する）。
            var newPairs = uniquePairsFromItems(targets);

            var revealPairs = null;
            if (!state.clearBeforeSelect) {
                // 追加で展開（維持）
                revealPairs = mergeRevealMemory(newPairs);
            } else {
                // 差し替え（今回分だけ）
                revealPairs = newPairs;
                resetRevealMemory(newPairs);
            }

            // 対象プロパティ群（compから取り直す）
            var revealProps = pairsToProps(revealPairs);

            // ★中継表示（同一ファミリーのときだけ）
            if (needBuffer) {
                try { forceRevealWithBuffer(revealProps, newFamily); } catch (eBuf) {}
                try { $.sleep(100); } catch (eBuf2) {}
            }

            // ★表示：できるだけ「選択したプロパティを表示」を使う
            var revealed = false;

            if (state.doSelectProps) {
                // “追加で展開”のため、記憶している分も含めて必ず選択状態にする
                for (var s = 0; s < revealPairs.length; s++) {
                    var e = revealPairs[s];
                    if (!e) continue;

                    var layer = null;
                    try { layer = state.comp.layer(e.layerIndex); } catch (e0) { layer = null; }
                    if (!layer) continue;

                    try { layer.selected = true; } catch (e1) {}

                    var p = null;
                    try { p = getPropByIndexPath(layer, propPathFromString(e.pathStr)); } catch (e2) { p = null; }
                    if (!p) continue;

                    try { p.selected = true; } catch (e3) {}
                }

                // SS 相当（選択したプロパティを表示）
                revealed = tryRevealSelectedProperties();
            }

            // フォールバック：エクスプレッションエラー方式
            if (!revealed) {
                revealPropsByExpressionError(revealProps);
            }

            // ★今回の表示ファミリーを記録
            state.lastRevealFamily = newFamily;
        }

        } catch (e) {
            try { alert("エラー:\n" + e.toString(), SCRIPT_NAME); } catch (e0) {}
        } finally {
            if (undoOpened) {
                try { app.endUndoGroup(); } catch (e1) {}
            }
            try { $.gc(); } catch (e2) {}
        }
    }

    // ---------- UI ----------
    
    // ---------- UI ----------
    function buildUI(thisObj) {
        var w = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

        w.orientation = "column";
        w.alignChildren = ["fill", "top"];

        // ---- HelpTip helper ----
        function setTip(el, tip) {
            try { el.helpTip = tip; } catch (e) {}
        }

        setTip(w, "アニメーション（キー/式）が付いたプロパティを、ボタンで表示/選択します。");

        var opt = w.add("panel", undefined, "Options");
        opt.orientation = "column";
        opt.alignChildren = ["left", "top"];
        setTip(opt, "表示/選択の挙動を設定します。");

        var r0 = opt.add("group");
        r0.orientation = "row";
        r0.alignChildren = ["left", "center"];

        var cbKey = r0.add("checkbox", undefined, "キー付き");
        cbKey.value = state.includeKeys;
        setTip(cbKey, "キーフレームがあるプロパティを対象にします。");

        var cbExpr = r0.add("checkbox", undefined, "式付き");
        cbExpr.value = state.includeExpr;
        setTip(cbExpr, "エクスプレッション（式）が有効なプロパティを対象にします。");

        var r1 = opt.add("group");
        r1.orientation = "row";
        r1.alignChildren = ["left", "center"];

        var cbReveal = r1.add("checkbox", undefined, "タイムラインに表示");
        cbReveal.value = state.revealInTimeline;
        setTip(cbReveal, "実行時に対象プロパティをタイムラインで展開表示します。");

        var r2 = opt.add("group");
        r2.orientation = "row";
        r2.alignChildren = ["left", "center"];

        var cbClear = r2.add("checkbox", undefined, "既存選択をクリア");
        cbClear.value = state.clearBeforeSelect;
        setTip(cbClear,
            "ON：実行前に現在のプロパティ選択を解除します。\n" +
            "OFF：既存選択を維持します。\n" +
            "※OFF + タイムラインに表示=ON の場合、既に展開されている（このスクリプトで展開した）ものを維持しつつ、押したボタン分を追加で展開します。"
        );

        var modeP = opt.add("panel", undefined, "実行内容");
        modeP.orientation = "column";
        modeP.alignChildren = ["left", "top"];
        setTip(modeP, "実行時に行う操作を 1つ 選びます（ラジオボタンで切替）。");

        var rbSelProps = modeP.add("radiobutton", undefined, "プロパティを選択");
        setTip(rbSelProps, "ボタン対象のプロパティを選択状態にします。\n※タイムラインに表示=ON の場合、選択したプロパティを展開表示しやすくなります。");

        var rbSelKeys = modeP.add("radiobutton", undefined, "カーソルのフレームにあるキーを選択");
        setTip(rbSelKeys, "現在時間（カーソル）のフレーム±Nfrにあるキーフレームを選択します。");

        var rg = modeP.add("group");
        rg.orientation = "row";
        rg.alignChildren = ["left", "center"];

        var stRange = rg.add("statictext", undefined, "  ±");
        setTip(stRange, "キー選択の範囲指定（±フレーム）。");

        var etRange = rg.add("edittext", undefined, String(state.cursorKeyRangeFrames));
        etRange.characters = 4;
        setTip(etRange, "キー選択範囲（±フレーム数）。例：2 → 現在フレーム±2fr");

        var stRange2 = rg.add("statictext", undefined, "fr");
        setTip(stRange2, "フレーム数");

        var rbAddKey = modeP.add("radiobutton", undefined, "カーソルにキーを打つ");
        setTip(rbAddKey,
            "ボタン対象のプロパティに、現在時間（カーソル位置）でキーフレームを追加します。\n" +
            "※同じ時刻に既にキーがある場合は、そのキー値を上書きします。"
        );

        function updateRangeEnabled() {
            var on = rbSelKeys.value;
            etRange.enabled = on;
            stRange.enabled = on;
            stRange2.enabled = on;
        }

        function setMode(mode) {
            // 3つはラジオで排他
            state.doSelectProps = (mode === "props");
            state.selectKeysAtCursor = (mode === "keys");
            state.addKeyAtCursor = (mode === "addKey");

            rbSelProps.value = state.doSelectProps;
            rbSelKeys.value = state.selectKeysAtCursor;
            rbAddKey.value = state.addKeyAtCursor;

            updateRangeEnabled();
        }

        // 初期状態（複数trueになっていても優先順で正規化）
        var initMode = "props";
        if (state.selectKeysAtCursor) initMode = "keys";
        if (state.addKeyAtCursor) initMode = "addKey";
        setMode(initMode);

        cbKey.onClick = function () { state.includeKeys = cbKey.value; };
        cbExpr.onClick = function () { state.includeExpr = cbExpr.value; };
        cbReveal.onClick = function () { state.revealInTimeline = cbReveal.value; };

        cbClear.onClick = function () { state.clearBeforeSelect = cbClear.value; };

        rbSelProps.onClick = function () { setMode("props"); };
        rbSelKeys.onClick = function () { setMode("keys"); };
        rbAddKey.onClick = function () { setMode("addKey"); };

        etRange.onChange = function () {
            state.cursorKeyRangeFrames = clampInt(etRange.text, 0, 9999, 0);
            etRange.text = String(state.cursorKeyRangeFrames);
        };

        var p = w.add("panel", undefined, "Select");
        p.orientation = "column";
        p.alignChildren = ["left", "top"];
        setTip(p, "ボタンを押すと、該当カテゴリのアニメ付きプロパティを表示/選択します。");

        var tipByCat = {
            "Position": "位置（非分割/次元分割X/Y/Z含む）を表示/選択します。",
            "PositionX": "次元分割された 位置X（Position_0）のみ表示/選択します。",
            "PositionY": "次元分割された 位置Y（Position_1）のみ表示/選択します。",
            "PositionZ": "次元分割された 位置Z（Position_2）のみ表示/選択します（2D/未分割は対象外）。",

            "Rotation": "回転（2D:Z / 3D:X/Y/Z）をまとめて表示/選択します。",
            "RotationX": "3Dレイヤーの 回転X のみ表示/選択します。",
            "RotationY": "3Dレイヤーの 回転Y のみ表示/選択します。",
            "RotationZ": "回転Z（2D/3D）を表示/選択します。",

            "Scale": "スケール（非分割/次元分割X/Y/Z含む）を表示/選択します。",
            "Opacity": "不透明度（Opacity）を表示/選択します。",
            "AnchorPoint": "アンカーポイント（非分割/次元分割X/Y/Z含む）を表示/選択します。",
            "Orientation": "オリエンテーション（3D）を表示/選択します。",
            "PointOfInterest": "注視点（Point of Interest。主にカメラ）を表示/選択します。",

            "AudioLevels": "オーディオレベルを表示/選択します。",
            "Mask": "マスク関連のアニメ付きプロパティを表示/選択します。",
            "Effect": "エフェクト（Effects）内のアニメ付きプロパティを表示/選択します。",
            "Shape": "シェイプ（ベクター）内のアニメ付きプロパティを表示/選択します。",
            "Text": "テキスト（アニメーター等）内のアニメ付きプロパティを表示/選択します。",

            "Other": "上記カテゴリ以外のアニメ付きプロパティを表示/選択します。",
            "All": "すべてのアニメ付きプロパティを表示/選択します。"
        };

        function addRow(labels, cats) {
            var g = p.add("group");
            g.orientation = "row";
            g.alignChildren = ["left", "center"];
            for (var i = 0; i < labels.length; i++) {
                (function (cat, label) {
                    var b = g.add("button", undefined, label);
                    setTip(b, tipByCat[cat] || (label + " を表示/選択します。"));
                    b.onClick = function () { selectByCategory(cat); };
                })(cats[i], labels[i]);
            }
        }

        addRow(["位置", "位置X", "位置Y", "位置Z"], ["Position", "PositionX", "PositionY", "PositionZ"]);
        addRow(["回転", "回転X", "回転Y", "回転Z"], ["Rotation", "RotationX", "RotationY", "RotationZ"]);
        addRow(["スケール", "透明度", "アンカー", "オリエン", "POI"], ["Scale", "Opacity", "AnchorPoint", "Orientation", "PointOfInterest"]);
        addRow(["オーディオ", "マスク", "エフェクト", "シェイプ", "テキスト"], ["AudioLevels", "Mask", "Effect", "Shape", "Text"]);
        addRow(["その他", "全て"], ["Other", "All"]);

        w.onResizing = w.onResize = function () { this.layout.resize(); };
        return w;
    }


    // ---- window singleton（重くなる/蓄積する環境対策）----
    var __g = $.global;
    if (!__g.__SUGI_UI__) __g.__SUGI_UI__ = {};
    var __key = "AnimPropSelect";

    if (!(thisObj instanceof Panel)) {
        var existing = __g.__SUGI_UI__[__key];
        if (existing && existing instanceof Window) {
            try { existing.show(); } catch (e0) {}
            try { existing.active = true; } catch (e1) {}
            try { existing.toFront(); } catch (e2) {}
            return;
        }
    }

    var ui = buildUI(thisObj);
    if (ui instanceof Window) {
        try {
            __g.__SUGI_UI__[__key] = ui;
            ui.onClose = function () {
                try { __g.__SUGI_UI__[__key] = null; } catch (e) {}
                return true;
            };
        } catch (e3) {}

        ui.center();
        ui.show();
    } else {
        try { ui.layout.layout(true); } catch (e4) {}
    }

})(this);
