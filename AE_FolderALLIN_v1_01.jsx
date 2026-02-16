// Project パネルで選択したフッテージ / コンポ / フォルダ を
// ひとつの新規フォルダにまとめて入れるスクリプト

(function () {
    if (!app.project) {
        alert("プロジェクトが開かれていません。");
        return;
    }

    var sel = app.project.selection;
    if (!sel || sel.length === 0) {
        alert("プロジェクトパネルで、まとめたいアイテムを複数選択してください。");
        return;
    }

    app.beginUndoGroup("選択アイテムをひとつのフォルダにまとめる");

    // 一意なフォルダ名を作成するヘルパー
    function makeUniqueFolderName(baseName, parentFolder) {
        var items = app.project.items;
        var name = baseName;
        var index = 1;
        var exists = true;

        while (exists) {
            exists = false;
            for (var i = 1; i <= items.length; i++) {
                var it = items[i];
                if (it instanceof FolderItem &&
                    it.parentFolder === parentFolder &&
                    it.name === name) {
                    exists = true;
                    break;
                }
            }
            if (exists) {
                index++;
                name = baseName + "_" + index;
            }
        }
        return name;
    }

    // ひとつ目のアイテムの親フォルダを基準にする
    var firstItem = sel[0];
    if (firstItem === app.project.rootFolder) {
        // もしルートフォルダが選ばれていたら無視して次を見る
        for (var j = 1; j < sel.length; j++) {
            if (sel[j] !== app.project.rootFolder) {
                firstItem = sel[j];
                break;
            }
        }
    }

    var parentFolder = firstItem.parentFolder || app.project.rootFolder;

    // フォルダ名は「最初のアイテム名 + _grp」をベースにする
    var baseName = firstItem.name + "_grp";
    var folderName = makeUniqueFolderName(baseName, parentFolder);

    // 新規フォルダを作成
    var newFolder = app.project.items.addFolder(folderName);
    newFolder.parentFolder = parentFolder;

    // 選択アイテムを新フォルダに移動
    for (var i = 0; i < sel.length; i++) {
        var item = sel[i];

        // ルートフォルダそのものは対象外
        if (item === app.project.rootFolder) continue;

        // すでに新フォルダ自身を選んでいた場合もスキップ
        if (item === newFolder) continue;

        item.parentFolder = newFolder;
    }

    app.endUndoGroup();
})();
