/*  選択レイヤーを「最後に選択した（= アクティブ）レイヤー」を親にする.jsx
    使い方：
    1) 対象レイヤーを複数選択（最後にクリックしたレイヤーが親になります）
    2) このスクリプトを実行
*/

(function () {
    function isCompItem(item) {
        return item && (item instanceof CompItem);
    }

    // parentLayer が childLayer の子孫（= parentLayer の親を辿ると childLayer が出る）なら true
    function wouldCreateCycle(childLayer, parentLayer) {
        var p = parentLayer;
        while (p) {
            if (p === childLayer) return true;
            p = p.parent;
        }
        return false;
    }

    var comp = app.project.activeItem;
    if (!isCompItem(comp)) {
        alert("コンポジションをアクティブにしてください。");
        return;
    }

    var layers = comp.selectedLayers;
    if (!layers || layers.length < 2) {
        alert("レイヤーを2つ以上選択してください。\n（最後に選択したレイヤーが親になります）");
        return;
    }

    // 「最後に選択した」扱い：アクティブレイヤーを優先
    var parentLayer = comp.activeLayer;

    // activeLayer が選択に含まれていない場合の保険（環境によってはそうなることがある）
    if (!parentLayer || !parentLayer.selected) {
        parentLayer = layers[layers.length - 1];
    }

    if (!parentLayer) {
        alert("親にするレイヤーを特定できませんでした。");
        return;
    }

    app.beginUndoGroup("Parent to Last Selected (Active) Layer");

    var skipped = [];
    for (var i = 0; i < layers.length; i++) {
        var child = layers[i];
        if (child === parentLayer) continue;

        if (wouldCreateCycle(child, parentLayer)) {
            skipped.push(child.name);
            continue;
        }

        try {
            child.parent = parentLayer;
        } catch (e) {
            skipped.push(child.name);
        }
    }

    app.endUndoGroup();

    if (skipped.length > 0) {
        alert("一部のレイヤーは親子付けできませんでした（循環参照など）。\n\n" + skipped.join("\n"));
    }
})();
