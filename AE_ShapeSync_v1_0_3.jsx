﻿﻿/*  ShapeSync (Style)
    文字シェイプレイヤー向け：形状は保持し、スタイル（線/塗り等）だけを全階層に同期
    - 「存在するプロパティのみ適用」ON: 既存の範囲で上書き（無ければ追加しない）
    - OFF: 無いスタイル要素/子プロパティ（例：Dash）も追加して同期を試みる
    - 「完全一致（スタイル構成）」ON: 余計なスタイル要素を削除 or 非表示（可能なら）して揃える
    v1.1.0
*/
(function ShapeSyncStyle(thisObj) {
    var SCRIPT_NAME = "ShapeSync";
    var GLOBAL_KEY = "__AE_ShapeSync_v1_0_3_UI__";

    // ----------------------------
    // State
    // ----------------------------
    var gState = {
        source: null,   // {compId, layerIndex, layerName}
        targets: []     // array of {compId, layerIndex, layerName}
    };

    // ----------------------------
    // Utility
    // ----------------------------
    function isCompItem(item) {
        return (item !== null && item !== undefined && item instanceof CompItem);
    }

    function getActiveComp() {
        var item = app.project.activeItem;
        if (!isCompItem(item)) return null;
        return item;
    }

    function isShapeLayer(layer) {
        if (!layer) return false;
        try {
            return (layer.matchName === "ADBE Vector Layer");
        } catch (e) {
            return false;
        }
    }

    function findCompById(compId) {
        if (!app.project) return null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem) {
                try {
                    if (it.id === compId) return it;
                } catch (e) {}
            }
        }
        return null;
    }

    function resolveLayer(ref) {
        if (!ref) return null;
        var comp = findCompById(ref.compId);
        if (!comp) return null;

        try {
            if (ref.layerIndex >= 1 && ref.layerIndex <= comp.numLayers) {
                var byIndex = comp.layer(ref.layerIndex);
                if (byIndex && byIndex.name === ref.layerName) return byIndex;
            }
        } catch (e) {}

        for (var i = 1; i <= comp.numLayers; i++) {
            var ly = comp.layer(i);
            if (ly && ly.name === ref.layerName) return ly;
        }
        return null;
    }

    function layerRefFromLayer(layer, comp) {
        return {
            compId: comp.id,
            layerIndex: layer.index,
            layerName: layer.name
        };
    }

    function alertWithTitle(msg) {
        alert(msg, SCRIPT_NAME);
    }

    function safeSetEnabled(dst, src) {
        try {
            if (dst && src && typeof dst.enabled !== "undefined" && typeof src.enabled !== "undefined") {
                dst.enabled = src.enabled;
            }
        } catch (e) {}
    }

    // ----------------------------
    // Match helpers
    // ----------------------------
    function isStyleElementGroup(p) {
        if (!p) return false;
        try {
            var mn = p.matchName;
            return (
                mn === "ADBE Vector Graphic - Fill"     || // Fill
                mn === "ADBE Vector Graphic - Stroke"   || // Stroke
                mn === "ADBE Vector Graphic - G-Fill"   || // Gradient Fill
                mn === "ADBE Vector Graphic - G-Stroke"    // Gradient Stroke
            );
        } catch (e) {
            return false;
        }
    }

    function isTransformGroup(p) {
        if (!p) return false;
        try {
            return (p.matchName === "ADBE Vector Transform Group");
        } catch (e) {
            return false;
        }
    }

    function isShapeGeneratorOrPath(p) {
        if (!p) return false;
        try {
            var mn = p.matchName;
            // 形状（文字の形そのもの）に関わるものはコピーしない（スタイル同期時）
            // 代表例：Path / Rect / Ellipse / Star / Polystar など
            // matchName はAE内部で細かいので広めに判定
            if (mn === "ADBE Vector Shape" || mn === "ADBE Vector Shape - Group") return true;
            if (mn.indexOf("ADBE Vector Shape -") === 0) return true; // Rect/Ellipse/Star等
            return false;
        } catch (e) {
            return false;
        }
    }

    function findMatchingChild(dstGroup, srcChild, usedMap) {
        var n = dstGroup.numProperties;

        for (var i = 1; i <= n; i++) {
            if (usedMap[i]) continue;
            var d = dstGroup.property(i);
            if (!d) continue;
            try {
                if (d.matchName === srcChild.matchName && d.name === srcChild.name) return i;
            } catch (e1) {}
        }

        for (var j = 1; j <= n; j++) {
            if (usedMap[j]) continue;
            var d2 = dstGroup.property(j);
            if (!d2) continue;
            try {
                if (d2.matchName === srcChild.matchName) return j;
            } catch (e2) {}
        }

        try {
            var idx = srcChild.propertyIndex;
            if (idx >= 1 && idx <= n && !usedMap[idx]) {
                var d3 = dstGroup.property(idx);
                if (d3 && d3.matchName === srcChild.matchName) return idx;
            }
        } catch (e3) {}

        return 0;
    }

    function tryAddProperty(dstGroup, matchName, desiredName) {
        try {
            var added = dstGroup.addProperty(matchName);
            if (added) {
                try {
                    if (desiredName) added.name = desiredName;
                } catch (e1) {}
            }
            return added;
        } catch (e) {
            return null;
        }
    }

    // ----------------------------
    // Keyframe / Property copy
    // ----------------------------
    function clearAllKeys(prop) {
        try {
            while (prop.numKeys > 0) {
                prop.removeKey(1);
            }
        } catch (e) {}
    }

    function copyExpression(srcProp, dstProp) {
        try {
            if (!srcProp.canSetExpression || !dstProp.canSetExpression) return;
            dstProp.expression = srcProp.expression;
            dstProp.expressionEnabled = srcProp.expressionEnabled;
        } catch (e) {}
    }

    function isSpatialProperty(prop) {
        try {
            return (
                prop.propertyValueType === PropertyValueType.TwoD_SPATIAL ||
                prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL
            );
        } catch (e) {
            return false;
        }
    }

    function copyKeys(srcProp, dstProp) {
        try {
            if (!srcProp || !dstProp) return;
            if (!srcProp.canVaryOverTime || !dstProp.canVaryOverTime) return;
            if (srcProp.numKeys <= 0) return;

            clearAllKeys(dstProp);

            for (var k = 1; k <= srcProp.numKeys; k++) {
                var t = srcProp.keyTime(k);
                var v = srcProp.keyValue(k);
                dstProp.setValueAtTime(t, v);
            }

            for (var j = 1; j <= srcProp.numKeys; j++) {
                try {
                    dstProp.setInterpolationTypeAtKey(
                        j,
                        srcProp.keyInInterpolationType(j),
                        srcProp.keyOutInterpolationType(j)
                    );
                } catch (e1) {}

                try {
                    var inEase = srcProp.keyInTemporalEase(j);
                    var outEase = srcProp.keyOutTemporalEase(j);
                    dstProp.setTemporalEaseAtKey(j, inEase, outEase);
                } catch (e2) {}

                try { dstProp.setTemporalContinuousAtKey(j, srcProp.keyTemporalContinuous(j)); } catch (e3) {}
                try { dstProp.setTemporalAutoBezierAtKey(j, srcProp.keyTemporalAutoBezier(j)); } catch (e4) {}

                if (isSpatialProperty(srcProp) && isSpatialProperty(dstProp)) {
                    try {
                        dstProp.setSpatialTangentsAtKey(j, srcProp.keyInSpatialTangent(j), srcProp.keyOutSpatialTangent(j));
                    } catch (e5) {}

                    try { dstProp.setSpatialContinuousAtKey(j, srcProp.keySpatialContinuous(j)); } catch (e6) {}
                    try { dstProp.setSpatialAutoBezierAtKey(j, srcProp.keySpatialAutoBezier(j)); } catch (e7) {}
                    try { dstProp.setRovingAtKey(j, srcProp.keyRoving(j)); } catch (e8) {}
                }
            }
        } catch (e) {}
    }

    function copyStaticValue(srcProp, dstProp) {
        try {
            if (!srcProp || !dstProp) return;
            if (srcProp.propertyValueType === PropertyValueType.NO_VALUE) return;
            try {
                dstProp.setValue(srcProp.value);
            } catch (e1) {}
        } catch (e) {}
    }

    function copyProperty(srcProp, dstProp) {
        if (!srcProp || !dstProp) return;

        safeSetEnabled(dstProp, srcProp);

        try {
            if (srcProp.numKeys && srcProp.numKeys > 0) {
                copyKeys(srcProp, dstProp);
            } else {
                copyStaticValue(srcProp, dstProp);
            }
        } catch (e) {}

        copyExpression(srcProp, dstProp);
    }

    // ----------------------------
    // Recursive copier (generic)
    // ----------------------------
    function copyGroupRecursiveAll(srcGroup, dstGroup, onlyExisting) {
        if (!srcGroup || !dstGroup) return;

        safeSetEnabled(dstGroup, srcGroup);

        var used = {};

        for (var i = 1; i <= srcGroup.numProperties; i++) {
            var srcChild = srcGroup.property(i);
            if (!srcChild) continue;

            var dstChild = null;

            var foundIndex = findMatchingChild(dstGroup, srcChild, used);
            if (foundIndex > 0) {
                dstChild = dstGroup.property(foundIndex);
                used[foundIndex] = true;
            } else {
                if (onlyExisting) {
                    continue;
                } else {
                    dstChild = tryAddProperty(dstGroup, srcChild.matchName, srcChild.name);
                    if (!dstChild) {
                        continue;
                    }
                }
            }

            if (srcChild.propertyType === PropertyType.PROPERTY) {
                if (dstChild && dstChild.propertyType === PropertyType.PROPERTY) {
                    copyProperty(srcChild, dstChild);
                }
            } else {
                copyGroupRecursiveAll(srcChild, dstChild, onlyExisting);
            }
        }
    }

    // ----------------------------
    // Recursive copier (style-only, shape keep)
    // ----------------------------
    function handleExtraStyleElement(dstStyleElem, extraMode) {
        if (!dstStyleElem) return;

        if (extraMode === "非表示") {
            var disabled = false;
            try {
                if (typeof dstStyleElem.enabled !== "undefined") {
                    dstStyleElem.enabled = false;
                    disabled = true;
                }
            } catch (e1) {}

            // enabledを持たない場合は削除にフォールバック（完全一致を担保）
            if (!disabled) {
                try {
                    dstStyleElem.remove();
                } catch (e2) {}
            }
        } else {
            // 削除
            try {
                dstStyleElem.remove();
            } catch (e3) {}
        }
    }

    function copyGroupRecursiveStyle(srcGroup, dstGroup, opts) {
        if (!srcGroup || !dstGroup) return;

        var allowAdd = opts.allowAdd;               // 追加を許可（存在するプロパティのみ適用OFF または 完全一致ON）
        var completeStyle = opts.completeStyle;     // 完全一致（スタイル構成）
        var extraMode = opts.extraMode;             // "削除" / "非表示"

        // この階層で「srcのスタイル要素」に対応付いたdstのスタイル要素を記録
        var usedDstStyleIdx = {};

        for (var i = 1; i <= srcGroup.numProperties; i++) {
            var srcChild = srcGroup.property(i);
            if (!srcChild) continue;

            // 形状保持モードでは、形状生成/Path系とTransformは触らない
            if (isTransformGroup(srcChild)) continue;
            if (isShapeGeneratorOrPath(srcChild)) continue;

            if (srcChild.propertyType === PropertyType.PROPERTY) {
                // 構造階層では通常ここに来ない想定だが、念のため何もしない
                continue;
            }

            // グループ
            if (isStyleElementGroup(srcChild)) {
                // スタイル要素（Fill/Stroke/Gradient）だけコピー対象
                var used = {};
                var foundIndex = findMatchingChild(dstGroup, srcChild, used);
                var dstChild = null;

                if (foundIndex > 0) {
                    dstChild = dstGroup.property(foundIndex);
                    usedDstStyleIdx[foundIndex] = true;
                } else {
                    if (allowAdd) {
                        dstChild = tryAddProperty(dstGroup, srcChild.matchName, srcChild.name);
                        if (dstChild) {
                            // 追加した場合、末尾に入るので index は推定できないが、完全一致の「余計判定」には影響しない（後段は“既存の余計”だけを見る）
                        }
                    } else {
                        // 無ければスキップ
                        dstChild = null;
                    }
                }

                if (dstChild) {
                    // スタイル要素内は可能な限り全部コピー（Dashなどの子追加も allowAdd で制御）
                    copyGroupRecursiveAll(srcChild, dstChild, !allowAdd);
                }

            } else {
                // 構造グループ：存在する場合のみ追従（構造は追加しない）
                // ここも matchName+name / matchName で探して再帰
                var used2 = {};
                var idx = findMatchingChild(dstGroup, srcChild, used2);
                if (idx > 0) {
                    var dstChild2 = dstGroup.property(idx);
                    copyGroupRecursiveStyle(srcChild, dstChild2, opts);
                } else {
                    // 構造が無い場合は掘れないのでスキップ（形状保持のため追加しない）
                    continue;
                }
            }
        }

        // 完全一致（スタイル構成）の場合：この階層の「余計なスタイル要素」を削除 or 非表示
        // ※ここでは「dstGroup直下のスタイル要素」だけを見る（形状や構造は触らない）
        if (completeStyle) {
            try {
                // 逆順でremoveしても安全なようにループ
                for (var d = dstGroup.numProperties; d >= 1; d--) {
                    var dstChild = dstGroup.property(d);
                    if (!dstChild) continue;

                    if (isStyleElementGroup(dstChild)) {
                        // srcからマッチしなかった “既存の” スタイル要素が余計
                        if (!usedDstStyleIdx[d]) {
                            handleExtraStyleElement(dstChild, extraMode);
                        }
                    }
                }
            } catch (e) {}
        }
    }

    // ----------------------------
    // Main copy entry
    // ----------------------------
    function copyShapeContentsAdvanced(sourceLayer, targetLayer, uiOpts) {
        if (!isShapeLayer(sourceLayer) || !isShapeLayer(targetLayer)) return;

        var srcContents = null;
        var dstContents = null;

        try {
            srcContents = sourceLayer.property("ADBE Root Vectors Group");
            dstContents = targetLayer.property("ADBE Root Vectors Group");
        } catch (e) {}

        if (!srcContents || !dstContents) return;

        if (uiOpts.styleOnly) {
            // スタイルのみ（形状保持）
            copyGroupRecursiveStyle(srcContents, dstContents, uiOpts);
        } else {
            // フル同期（従来寄り）
            copyGroupRecursiveAll(srcContents, dstContents, uiOpts.onlyExisting);
        }
    }

    // ----------------------------
    // UI actions
    // ----------------------------
    function updateStatus(statusText, uiState) {
        if (!statusText) return;

        var srcName = (gState.source && gState.source.layerName) ? gState.source.layerName : "未設定";
        var tgtCount = (gState.targets && gState.targets.length) ? gState.targets.length : 0;

        var mode = "";
        if (uiState && uiState.styleOnly) mode += "スタイルのみ";
        else mode += "フル";

        if (uiState && uiState.completeStyle) mode += " / 完全一致";
        statusText.text = "コピー元: " + srcName + " / 対象: " + tgtCount + " / " + mode;
    }

    function rememberTargets(statusText, uiState) {
        var comp = getActiveComp();
        if (!comp) {
            alertWithTitle("コンポがアクティブではありません。");
            return;
        }

        var sel = comp.selectedLayers;
        if (!sel || sel.length === 0) {
            alertWithTitle("対象にするシェイプレイヤーを複数選択してください。");
            return;
        }

        var arr = [];
        for (var i = 0; i < sel.length; i++) {
            if (isShapeLayer(sel[i])) {
                arr.push(layerRefFromLayer(sel[i], comp));
            }
        }

        if (arr.length === 0) {
            alertWithTitle("選択内にシェイプレイヤーがありません。");
            return;
        }

        gState.targets = arr;
        updateStatus(statusText, uiState);
    }

    function rememberSource(statusText, uiState) {
        var comp = getActiveComp();
        if (!comp) {
            alertWithTitle("コンポがアクティブではありません。");
            return;
        }

        var sel = comp.selectedLayers;
        if (!sel || sel.length !== 1) {
            alertWithTitle("コピー元はシェイプレイヤーを1つだけ選択してください。");
            return;
        }

        var ly = sel[0];
        if (!isShapeLayer(ly)) {
            alertWithTitle("コピー元はシェイプレイヤー（Shape Layer）を選択してください。");
            return;
        }

        gState.source = layerRefFromLayer(ly, comp);
        updateStatus(statusText, uiState);
    }

    function createSampleShapeLayer(statusText, uiState) {
        var comp = getActiveComp();
        if (!comp) {
            alertWithTitle("コンポがアクティブではありません。");
            return;
        }

        app.beginUndoGroup(SCRIPT_NAME + " - サンプル作成");

        try {
            var layer = comp.layers.addShape();
            layer.name = "Style_Master";
            layer.guideLayer = true;

            // 左上付近
            try {
                var tr = layer.property("ADBE Transform Group");
                tr.property("ADBE Position").setValue([0, 0]);
            } catch (e1) {}

            var contents = layer.property("ADBE Root Vectors Group");

            var group = contents.addProperty("ADBE Vector Group");
            group.name = "Master";

            var groupContents = group.property("ADBE Vectors Group");

            var rect = groupContents.addProperty("ADBE Vector Shape - Rect");
            rect.name = "Rect 1";
            try { rect.property("ADBE Vector Rect Size").setValue([180, 120]); } catch (e2) {}
            try { rect.property("ADBE Vector Rect Position").setValue([140, 100]); } catch (e3) {}

            var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
            fill.name = "Fill 1";
            try { fill.property("ADBE Vector Fill Color").setValue([1, 1, 1, 1]); } catch (e4) {}
            try { fill.property("ADBE Vector Fill Opacity").setValue(100); } catch (e5) {}

            var stroke = groupContents.addProperty("ADBE Vector Graphic - Stroke");
            stroke.name = "Stroke 1";
            try { stroke.property("ADBE Vector Stroke Color").setValue([1, 0, 0, 1]); } catch (e6) {}
            try { stroke.property("ADBE Vector Stroke Width").setValue(8); } catch (e7) {}
            try { stroke.property("ADBE Vector Stroke Opacity").setValue(100); } catch (e8) {}

        } catch (e) {
            alertWithTitle("サンプル作成でエラー:\n" + e.toString());
        } finally {
            app.endUndoGroup();
        }

        updateStatus(statusText, uiState);
    }

    function runApply(uiState, statusText) {
        if (!gState.source) {
            alertWithTitle("コピー元が記憶されていません。");
            return;
        }
        if (!gState.targets || gState.targets.length === 0) {
            alertWithTitle("対象が記憶されていません。");
            return;
        }

        var srcLayer = resolveLayer(gState.source);
        if (!srcLayer || !isShapeLayer(srcLayer)) {
            alertWithTitle("コピー元レイヤーが見つからないか、シェイプレイヤーではありません。");
            return;
        }

        app.beginUndoGroup(SCRIPT_NAME + " - 適用");

        try {
            for (var i = 0; i < gState.targets.length; i++) {
                var dstLayer = resolveLayer(gState.targets[i]);
                if (!dstLayer) continue;
                if (!isShapeLayer(dstLayer)) continue;

                if (dstLayer === srcLayer) continue;

                copyShapeContentsAdvanced(srcLayer, dstLayer, uiState);
            }
        } catch (e) {
            alertWithTitle("実行中エラー:\n" + e.toString());
        } finally {
            app.endUndoGroup();
        }

        updateStatus(statusText, uiState);
    }

    // ----------------------------
    // UI build
    // ----------------------------
    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

        if (!pal) return pal;

        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];

        var chkOnlyExisting = pal.add("checkbox", undefined, "存在するプロパティのみ適用");
        chkOnlyExisting.value = true;

        var chkStyleOnly = pal.add("checkbox", undefined, "スタイルのみ（形状保持）");
        chkStyleOnly.value = true;

        var chkComplete = pal.add("checkbox", undefined, "完全一致（スタイル構成）");
        chkComplete.value = false;

        var grpExtra = pal.add("group");
        grpExtra.orientation = "row";
        grpExtra.alignChildren = ["left", "center"];
        grpExtra.add("statictext", undefined, "余計なスタイル要素:");
        var ddExtra = grpExtra.add("dropdownlist", undefined, ["削除", "非表示"]);
        ddExtra.selection = 0;

        var btnSample = pal.add("button", undefined, "サンプルシェイプレイヤー作成");
        var btnRememberSource = pal.add("button", undefined, "コピー元シェイプレイヤー記憶");
        var btnRememberTargets = pal.add("button", undefined, "対象シェイプレイヤー記憶");
        var btnRun = pal.add("button", undefined, "実行");

        var statusGrp = pal.add("group");
        statusGrp.orientation = "row";
        statusGrp.alignChildren = ["fill", "center"];
        var statusText = statusGrp.add("statictext", undefined, "", { truncate: "end" });
        statusText.characters = 45;

        function readUiState() {
            var completeStyle = chkComplete.value === true;

            // 完全一致ONなら「追加あり」を強制（存在するプロパティのみ適用の意味が衝突するため）
            var onlyExisting = chkOnlyExisting.value === true;
            var allowAdd = completeStyle ? true : !onlyExisting;

            // 余計モード
            var extraMode = "削除";
            try {
                if (ddExtra.selection && ddExtra.selection.text) extraMode = ddExtra.selection.text;
            } catch (e) {}

            // 完全一致中は余計モードUIを有効化
            ddExtra.enabled = completeStyle;

            return {
                onlyExisting: onlyExisting,
                allowAdd: allowAdd,
                styleOnly: (chkStyleOnly.value === true),
                completeStyle: completeStyle,
                extraMode: extraMode
            };
        }

        var uiState0 = readUiState();
        updateStatus(statusText, uiState0);
        ddExtra.enabled = chkComplete.value === true;

        chkComplete.onClick = function() {
            var st = readUiState();
            updateStatus(statusText, st);
        };
        chkStyleOnly.onClick = function() {
            var st2 = readUiState();
            updateStatus(statusText, st2);
        };
        chkOnlyExisting.onClick = function() {
            var st3 = readUiState();
            updateStatus(statusText, st3);
        };
        ddExtra.onChange = function() {
            var st4 = readUiState();
            updateStatus(statusText, st4);
        };

        btnSample.onClick = function() {
            var st = readUiState();
            createSampleShapeLayer(statusText, st);
        };

        btnRememberSource.onClick = function() {
            var st = readUiState();
            rememberSource(statusText, st);
        };

        btnRememberTargets.onClick = function() {
            var st = readUiState();
            rememberTargets(statusText, st);
        };

        btnRun.onClick = function() {
            var st = readUiState();
            runApply(st, statusText);
        };

        pal.onResizing = pal.onResize = function() {
            try { this.layout.resize(); } catch (e) {}
        };

        return pal;
    }

    // ----------------------------
    // Boot
    // ----------------------------
    if (!(thisObj instanceof Panel)) {
        if (!($.global[GLOBAL_KEY] === undefined || $.global[GLOBAL_KEY] === null)) {
            try {
                $.global[GLOBAL_KEY].show();
                $.global[GLOBAL_KEY].active = true;
            } catch (_reuseErr) {}
            return;
        }
    }

    var pal = buildUI(thisObj);
    if (pal instanceof Window) {
        $.global[GLOBAL_KEY] = pal;
        pal.onClose = function () {
            try { $.global[GLOBAL_KEY] = null; } catch (_closeErr) {}
        };
        pal.center();
        pal.show();
    } else {
        try { pal.layout.layout(true); } catch (e) {}
    }

})(this);
