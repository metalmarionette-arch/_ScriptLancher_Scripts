/*
 * Marker Utility Panel – v02.15  (2025‑06‑05)
 * ------------------------------------------------------------
 * ▼ レイアウト
 *   [↑↑] /コピー/   [↑] /移動/    // レイヤー → コンポ
 *   [↓↓] /コピー/   [↓] /移動/    // コンポ → レイヤー
 *   [↶↶] /コピー/   [↶] /移動/    // ネストコンポ内 → レイヤー
 *   [↷↷] /コピー/   [↷] /移動/    // レイヤー → ネストコンポ内
 *   マーカーをコピー   [選択レイヤー] [アクティブコンポ]
 *   マーカーをペースト [選択レイヤー] [アクティブコンポ]
 *   マーカー全削除     [選択レイヤー] [アクティブコンポ]
 *
 *  各ボタンで実行される処理:
 *    ↑↑: 選択レイヤーのマーカーをアクティブコンポにコピー
 *    ↑ : 選択レイヤーのマーカーをアクティブコンポに移動
 *    ↓↓: アクティブコンポのマーカーを選択レイヤーにコピー
 *    ↓ : アクティブコンポのマーカーを選択レイヤーに移動
 *    ↶↶: ネストコンポ内マーカーを親コンポレイヤーにコピー
 *    ↶ : ネストコンポ内マーカーを親コンポレイヤーに移動
 *    ↷↷: 親コンポレイヤーのマーカーをネストコンポ内にコピー
 *    ↷ : 親コンポレイヤーのマーカーをネストコンポ内に移動
 *
 *  使い方:
 *    ① 本ファイルを MarkerUtility_v02_15.jsx として保存
 *    ② AE で「ファイル＞スクリプト＞スクリプトファイルを実行…」
 *    ③ [Marker Utility] パレットが開きます
 *
 *  Tested on After Effects 2025 (build 24.x)
 * ------------------------------------------------------------
 */

(function MarkerUtilityPanel(thisObj) {
    var SCRIPT_NAME = "Marker Utility";
    var GLOBAL_KEY = "__AE_MarkerUtility_v01_08_UI__";

    if (!(thisObj instanceof Panel)) {
        if (!($.global[GLOBAL_KEY] === undefined || $.global[GLOBAL_KEY] === null)) {
            try {
                $.global[GLOBAL_KEY].show();
                $.global[GLOBAL_KEY].active = true;
            } catch (_reuseErr) {}
            return;
        }
    }

    /* -------------------------------------------------- UI */
    var win = (thisObj instanceof Panel) ? thisObj : new Window("palette", SCRIPT_NAME, undefined, {resizeable:true});
    if (!win) return;

    if (win instanceof Window) {
        $.global[GLOBAL_KEY] = win;
        win.onClose = function () {
            try { $.global[GLOBAL_KEY] = null; } catch (_closeErr) {}
        };
    }

    win.orientation = "column";
    win.alignChildren = ["fill", "top"];

    function addSeparator(parent) {
        var sep = parent.add("panel", undefined, undefined, {borderStyle: "etched"});
        sep.alignment = ["fill", 2];
    }

    /* --- 矢印ボタン群 ------------------------------------------ */
    var grpArrows = win.add("group");
    grpArrows.orientation = "row";
    grpArrows.alignChildren = ["left", "center"];

    // ↑↑ /コピー/
    var btnUpCopy = grpArrows.add("button", undefined, "↑↑");
    btnUpCopy.size = [30, 20];
    btnUpCopy.helpTip = "選択中のレイヤーのマーカーをアクティブコンポにコピーします";
    // ↑ /移動/
    var btnUpMove = grpArrows.add("button", undefined, "↑");
    btnUpMove.size = [30, 20];
    btnUpMove.helpTip = "選択中のレイヤーのマーカーをアクティブコンポに移動します";

    // スペース
    grpArrows.add("statictext", undefined, "   ");

    // ↓↓ /コピー/
    var btnDownCopy = grpArrows.add("button", undefined, "↓↓");
    btnDownCopy.size = [30, 20];
    btnDownCopy.helpTip = "アクティブコンポのマーカーを選択中のレイヤーにコピーします";
    // ↓ /移動/
    var btnDownMove = grpArrows.add("button", undefined, "↓");
    btnDownMove.size = [30, 20];
    btnDownMove.helpTip = "アクティブコンポのマーカーを選択中のレイヤーに移動します";

    // スペース
    grpArrows.add("statictext", undefined, "   ");

    // ↶↶ /コピー/
    var btnLeftLeftCopy = grpArrows.add("button", undefined, "↶↶");
    btnLeftLeftCopy.size = [30, 20];
    btnLeftLeftCopy.helpTip = "選択中のネストコンポ内のマーカーを、親コンポレイヤーにコピーします";
    // ↶ /移動/
    var btnLeftMove = grpArrows.add("button", undefined, "↶");
    btnLeftMove.size = [30, 20];
    btnLeftMove.helpTip = "選択中のネストコンポ内のマーカーを、親コンポレイヤーに移動します";

    // スペース
    grpArrows.add("statictext", undefined, "   ");

    // ↷↷ /コピー/
    var btnRightRightCopy = grpArrows.add("button", undefined, "↷↷");
    btnRightRightCopy.size = [30, 20];
    btnRightRightCopy.helpTip = "選択中の親コンポレイヤーのマーカーをネストコンポ内にコピーします";
    // ↷ /移動/
    var btnRightMove = grpArrows.add("button", undefined, "↷");
    btnRightMove.size = [30, 20];
    btnRightMove.helpTip = "選択中の親コンポレイヤーのマーカーをネストコンポ内に移動します";

    addSeparator(win);

    /* --- マーカーコピー／ペースト／削除 ------------------------- */
    var grpCopyPaste = win.add("group");
    grpCopyPaste.orientation = "column";
    grpCopyPaste.alignChildren = ["fill", "top"];

    var grpCopyRow = grpCopyPaste.add("group");
    grpCopyRow.orientation = "row";
    grpCopyRow.alignChildren = ["left", "center"];
    var btnCopySelLayer = grpCopyRow.add("button", undefined, "マーカーをコピー [選択レイヤー]");
    btnCopySelLayer.helpTip = "選択中のレイヤーのマーカーを一時保存します";
    var btnCopyComp = grpCopyRow.add("button", undefined, "マーカーをコピー [アクティブコンポ]");
    btnCopyComp.helpTip = "アクティブコンポのマーカーを一時保存します";

    var grpPasteRow = grpCopyPaste.add("group");
    grpPasteRow.orientation = "row";
    grpPasteRow.alignChildren = ["left", "center"];
    var btnPasteSelLayer = grpPasteRow.add("button", undefined, "マーカーをペースト [選択レイヤー]");
    btnPasteSelLayer.helpTip = "保存したマーカーを選択中のレイヤーに貼り付けます";
    var btnPasteComp = grpPasteRow.add("button", undefined, "マーカーをペースト [アクティブコンポ]");
    btnPasteComp.helpTip = "保存したマーカーをアクティブコンポに貼り付けます";

    addSeparator(win);

    var grpDel = win.add("group");
    grpDel.orientation = "row";
    grpDel.alignChildren = ["left", "center"];
    grpDel.add("statictext", undefined, "マーカー全削除");
    var btnDelSel = grpDel.add("button", undefined, "選択レイヤー");
    btnDelSel.helpTip = "選択中のレイヤーすべてのマーカーを削除します";
    var btnDelComp = grpDel.add("button", undefined, "アクティブコンポ");
    btnDelComp.helpTip = "アクティブコンポのマーカーをすべて削除します";

    win.layout.layout(true);
    if (win instanceof Window) {
        win.center();
        win.show();    // フローティング Window を表示
    }

    /* -------------------------------------------------- CORE UTILITIES */

    function alertNoActiveComp() {
        alert("アクティブコンポがありません");
    }

    function getActiveComp() {
        var c = app.project.activeItem;
        return (c instanceof CompItem) ? c : null;
    }

    function runWithUndo(label, fn) {
        app.beginUndoGroup(label);
        try {
            fn();
        } finally {
            app.endUndoGroup();
        }
    }

    function copyLayerMarkersToComp(isMove) {
        var comp = getActiveComp(); if (!comp) { alertNoActiveComp(); return; }
        var layers = comp.selectedLayers; if (!layers || layers.length === 0) { alert("レイヤーが選択されていません"); return; }
        runWithUndo("Layer→Comp Markers" + (isMove ? " (Move)":""), function () {
            for (var i = 0; i < layers.length; i++) {
                var l = layers[i]; var src = l.property("Marker"); var dst = comp.markerProperty;
                for (var k = 1; k <= src.numKeys; k++) { dst.setValueAtTime(src.keyTime(k), src.keyValue(k)); }
                if (isMove) { for (k = src.numKeys; k >= 1; k--) src.removeKey(k); }
            }
        });
    }

    function copyCompMarkersToLayer(isMove) {
        var comp = getActiveComp(); if (!comp) { alertNoActiveComp(); return; }
        var layers = comp.selectedLayers; if (!layers || layers.length === 0) { alert("レイヤーが選択されていません"); return; }
        var src = comp.markerProperty; if (src.numKeys === 0) { alert("アクティブコンポにマーカーがありません"); return; }
        runWithUndo("Comp→Layer Markers" + (isMove ? " (Move)":""), function () {
            for (var i = 0; i < layers.length; i++) {
                var l = layers[i]; var dst = l.property("Marker");
                for (var k = 1; k <= src.numKeys; k++) {
                    var t = src.keyTime(k); if (t < l.inPoint || t > l.outPoint) continue; dst.setValueAtTime(t, src.keyValue(k));
                }
            }
            if (isMove) { for (var k = src.numKeys; k >= 1; k--) src.removeKey(k); }
        });
    }

    function copyNestedCompToLayer(isMove) {
        var comp = getActiveComp(); if (!comp) { alertNoActiveComp(); return; }
        var layers = comp.selectedLayers; if (!layers || layers.length === 0) { alert("レイヤーが選択されていません"); return; }
        runWithUndo("NestedComp→Layer Markers" + (isMove ? " (Move)":""), function () {
            for (var i = 0; i < layers.length; i++) {
                var l = layers[i]; if (!(l instanceof AVLayer) || !(l.source instanceof CompItem)) continue;
                var nested = l.source.markerProperty; if (nested.numKeys === 0) continue;
                var dst = l.property("Marker"); var stretch = l.stretch / 100.0; var offset = l.startTime;
                for (var k = 1; k <= nested.numKeys; k++) {
                    var tSrc = nested.keyTime(k); var tDst = offset + tSrc * stretch; if (tDst < l.inPoint || tDst > l.outPoint) continue; dst.setValueAtTime(tDst, nested.keyValue(k));
                }
                if (isMove) { for (var m = nested.numKeys; m >= 1; m--) nested.removeKey(m); }
            }
        });
    }

    function copyLayerMarkersToNestedComp(isMove) {
        var comp = getActiveComp(); if (!comp) { alertNoActiveComp(); return; }
        var layers = comp.selectedLayers; if (!layers || layers.length === 0) { alert("レイヤーが選択されていません"); return; }
        runWithUndo("Layer→NestedComp Markers" + (isMove ? " (Move)":""), function () {
            for (var i = 0; i < layers.length; i++) {
                var l = layers[i]; if (!(l instanceof AVLayer) || !(l.source instanceof CompItem)) continue;
                var src = l.property("Marker"); var nestedComp = l.source; var dstNested = nestedComp.markerProperty;
                for (var k = 1; k <= src.numKeys; k++) { dstNested.setValueAtTime(src.keyTime(k), src.keyValue(k)); }
                if (isMove) { for (var m = src.numKeys; m >= 1; m--) src.removeKey(m); }
            }
        });
    }

    var clipboardMarkers = { times: [], values: [] };

    function copyMarkersFromSelectedLayers() {
        var comp = getActiveComp(); if (!comp) { alertNoActiveComp(); return; }
        var layers = comp.selectedLayers; if (!layers || layers.length === 0) { alert("レイヤーが選択されていません"); return; }
        clipboardMarkers.times = []; clipboardMarkers.values = [];
        for (var i = 0; i < layers.length; i++) {
            var m = layers[i].property("Marker"); for (var k = 1; k <= m.numKeys; k++) { clipboardMarkers.times.push(m.keyTime(k)); clipboardMarkers.values.push(m.keyValue(k)); }
        }
        alert("マーカーをコピーしました");
    }

    function copyMarkersFromActiveComp() {
        var comp = getActiveComp(); if (!comp) { alertNoActiveComp(); return; }
        var m = comp.markerProperty; if (m.numKeys === 0) { alert("アクティブコンポにマーカーがありません"); return; }
        clipboardMarkers.times = []; clipboardMarkers.values = [];
        for (var k = 1; k <= m.numKeys; k++) { clipboardMarkers.times.push(m.keyTime(k)); clipboardMarkers.values.push(m.keyValue(k)); }
        alert("コンポのマーカーをコピーしました");
    }

    function pasteMarkersToSelectedLayers() {
        var comp = getActiveComp(); if (!comp) { alertNoActiveComp(); return; }
        var layers = comp.selectedLayers; if (!layers || layers.length === 0) { alert("レイヤーが選択されていません"); return; }
        if (clipboardMarkers.times.length === 0) { alert("コピーされたマーカーがありません"); return; }
        runWithUndo("Paste Markers to Layers", function () {
            for (var i = 0; i < layers.length; i++) {
                var dst = layers[i].property("Marker"); for (var j = 0; j < clipboardMarkers.times.length; j++) {
                    var t = clipboardMarkers.times[j]; if (t < layers[i].inPoint || t > layers[i].outPoint) continue;
                    dst.setValueAtTime(t, clipboardMarkers.values[j]);
                }
            }
        });
        alert("マーカーを貼り付けました");
    }

    function pasteMarkersToActiveComp() {
        var comp = getActiveComp(); if (!comp) { alertNoActiveComp(); return; }
        if (clipboardMarkers.times.length === 0) { alert("コピーされたマーカーがありません"); return; }
        runWithUndo("Paste Markers to Comp", function () {
            var dst = comp.markerProperty; for (var j = 0; j < clipboardMarkers.times.length; j++) { dst.setValueAtTime(clipboardMarkers.times[j], clipboardMarkers.values[j]); }
        });
        alert("マーカーを貼り付けました");
    }

    function deleteMarkersOnSelectedLayers() {
        var comp = getActiveComp(); if (!comp) { alertNoActiveComp(); return; }
        var layers = comp.selectedLayers; if (!layers || layers.length === 0) { alert("レイヤーが選択されていません"); return; }
        runWithUndo("Delete Layer Markers", function () {
            for (var i = 0; i < layers.length; i++) { var m = layers[i].property("Marker"); for (var k = m.numKeys; k >= 1; k--) m.removeKey(k); }
        });
    }

    function deleteMarkersOnActiveComp() {
        var comp = getActiveComp(); if (!comp) { alertNoActiveComp(); return; }
        var m = comp.markerProperty; if (m.numKeys === 0) return;
        runWithUndo("Delete Comp Markers", function () {
            for (var k = m.numKeys; k >= 1; k--) m.removeKey(k);
        });
    }

    /* ---------------------------------------------- EVENT BINDINGS */
    btnUpCopy.onClick        = function () { copyLayerMarkersToComp(false); };
    btnUpMove.onClick        = function () { copyLayerMarkersToComp(true);  };
    btnDownCopy.onClick      = function () { copyCompMarkersToLayer(false); };
    btnDownMove.onClick      = function () { copyCompMarkersToLayer(true);  };
    btnLeftLeftCopy.onClick  = function () { copyNestedCompToLayer(false); };
    btnLeftMove.onClick      = function () { copyNestedCompToLayer(true);  };
    btnRightRightCopy.onClick= function () { copyLayerMarkersToNestedComp(false); };
    btnRightMove.onClick     = function () { copyLayerMarkersToNestedComp(true);  };
    btnCopySelLayer.onClick  = function () { copyMarkersFromSelectedLayers(); };
    btnCopyComp.onClick      = function () { copyMarkersFromActiveComp();   };
    btnPasteSelLayer.onClick = function () { pasteMarkersToSelectedLayers(); };
    btnPasteComp.onClick     = function () { pasteMarkersToActiveComp();     };
    btnDelSel.onClick        = function () { deleteMarkersOnSelectedLayers(); };
    btnDelComp.onClick       = function () { deleteMarkersOnActiveComp();       };

})(this);
