/* 位置の次元分割（複数選択レイヤー）
   - 選択レイヤーの「位置」を一括で次元分割します
   - すでに分割済みのレイヤーはスキップ
*/
(function () {
    function splitPositionDimensionsForSelectedLayers() {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) {
            alert("コンポジションをアクティブにしてください。");
            return;
        }

        var layers = comp.selectedLayers;
        if (!layers || layers.length === 0) {
            alert("次元分割したいレイヤーを複数選択してください。");
            return;
        }

        app.beginUndoGroup("Split Position Dimensions (Selected Layers)");

        var done = 0, skipped = 0, failed = 0;

        for (var i = 0; i < layers.length; i++) {
            var lyr = layers[i];

            try {
                var tr = lyr.property("ADBE Transform Group");
                if (!tr) { failed++; continue; }

                var pos = tr.property("ADBE Position");
                if (!pos || !(pos instanceof Property)) { failed++; continue; }

                // すでに次元分割済みならスキップ
                if (pos.dimensionsSeparated === true) {
                    skipped++;
                    continue;
                }

                pos.dimensionsSeparated = true;
                done++;

            } catch (e) {
                failed++;
            }
        }

        app.endUndoGroup();

        // 余計なポップアップを出したくない場合はここは無音でOK
        // 必要ならログ用途に alert を復活させてください
        // alert("完了: " + done + " / スキップ: " + skipped + " / 失敗: " + failed);
    }

    splitPositionDimensionsForSelectedLayers();
})();
