// Project パネルで選択したフッテージ / コンポを
// それぞれ専用の新規フォルダに入れるスクリプト

(function () {
    if (!app.project) {
        alert("プロジェクトが開かれていません。");
        return;
    }

    var sel = app.project.selection;
    if (!sel || sel.length === 0) {
        alert("プロジェクトパネルでフッテージやコンポを選択してください。");
        return;
    }

    app.beginUndoGroup("選択アイテムを個別フォルダにまとめる");

    // 親フォルダ内で同名フォルダがあるかチェックして、
    // 必要なら _2, _3 ... のようにリネームして一意にするヘルパー
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

    for (var i = 0; i < sel.length; i++) {
        var item = sel[i];

        // ルートフォルダそのものは対象外
        if (item === app.project.rootFolder) {
            continue;
        }

        // 主にフッテージ・コンポを想定（フォルダを選んでいても動きはします）
        // 必要ならここで型を絞ってもOK:
        // if (!(item instanceof CompItem) && !(item instanceof FootageItem)) continue;

        var parentFolder = item.parentFolder;
        var baseName = item.name;

        // 親フォルダの下で一意なフォルダ名を作成
        var folderName = makeUniqueFolderName(baseName, parentFolder);

        // 新規フォルダ作成（親フォルダの直下）
        var newFolder = app.project.items.addFolder(folderName);
        newFolder.parentFolder = parentFolder;

        // アイテムを新フォルダの中へ移動
        item.parentFolder = newFolder;
    }

    app.endUndoGroup();
})();
