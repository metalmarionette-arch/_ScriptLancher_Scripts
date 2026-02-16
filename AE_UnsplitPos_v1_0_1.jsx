/*  UnsplitPosition.jsx
    選択レイヤーの「位置」の次元分割を解除（統合）する
    - レイヤー未選択ならコンポ内の全レイヤーが対象
*/

(function UnsplitPosition() {
    if (!app.project) {
        alert("プロジェクトが開かれていません。");
        return;
    }

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        alert("アクティブなコンポジションを開いてください。");
        return;
    }

    var targetLayers = comp.selectedLayers;
    var useAll = false;

    if (!targetLayers || targetLayers.length === 0) {
        useAll = true;
    }

    var changedCount = 0;
    var checkedCount = 0;

    function processLayer(layer) {
        if (!layer) return;

        var tr = layer.property("ADBE Transform Group");
        if (!tr) return;

        var pos = tr.property("ADBE Position");
        if (!pos) return;

        checkedCount++;

        // 次元分割を解除できる＆現在分割されている場合のみ解除
        try {
            if (pos.canSetSeparationDimensions && pos.dimensionsSeparated) {
                pos.setSeparationDimensions(false);
                changedCount++;
            }
        } catch (e) {
            // 何らかの理由で解除できないケースはスキップ
        }
    }

    app.beginUndoGroup("Unsplit Position Dimensions");

    if (useAll) {
        for (var i = 1; i <= comp.numLayers; i++) {
            processLayer(comp.layer(i));
        }
    } else {
        for (var j = 0; j < targetLayers.length; j++) {
            processLayer(targetLayers[j]);
        }
    }

    app.endUndoGroup();

    if (checkedCount === 0) {
        alert("対象レイヤーに「位置」プロパティが見つかりませんでした。");
    } else if (changedCount === 0) {
        alert("次元分割されている「位置」は見つかりませんでした。");
    } else {
        alert("次元分割を解除しました： " + changedCount + " レイヤー");
    }
})();
