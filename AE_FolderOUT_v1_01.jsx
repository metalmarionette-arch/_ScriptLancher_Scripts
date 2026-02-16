// Projectパネルで選択したフォルダを削除し、
// その中身（コンポ・フッテージ・フォルダなど）は
// 一つ上の親フォルダに残すスクリプト

(function () {
    if (!app.project) {
        alert("プロジェクトが開かれていません。");
        return;
    }

    var sel = app.project.selection;
    if (!sel || sel.length === 0) {
        alert("削除したいフォルダをプロジェクトパネルで選択してください。");
        return;
    }

    app.beginUndoGroup("フォルダを削除して中身を残す");

    // フォルダの階層の深さを調べる（ルートが一番浅い）
    function getFolderDepth(folder) {
        var depth = 0;
        var f = folder;
        while (f && f !== app.project.rootFolder) {
            depth++;
            f = f.parentFolder;
        }
        return depth;
    }

    // 対象となるフォルダだけ抽出
    var folders = [];
    for (var i = 0; i < sel.length; i++) {
        if (sel[i] instanceof FolderItem && sel[i] !== app.project.rootFolder) {
            folders.push(sel[i]);
        }
    }

    if (folders.length === 0) {
        alert("フォルダが選択されていません。フォルダを選択してから実行してください。");
        app.endUndoGroup();
        return;
    }

    // ネストしている場合に備えて、階層が深いフォルダから順に処理
    folders.sort(function (a, b) {
        return getFolderDepth(b) - getFolderDepth(a); // 深い順
    });

    // 各フォルダの中身を親フォルダに移動してからフォルダを削除
    for (var fIndex = 0; fIndex < folders.length; fIndex++) {
        var folder = folders[fIndex];

        // 念のため親フォルダを取得（ルートなら rootFolder）
        var parent = folder.parentFolder || app.project.rootFolder;

        // folder.items は1始まり & 長さが変わるので、後ろから回すのが安全
        for (var idx = folder.numItems; idx >= 1; idx--) {
            var child = folder.items[idx];

            // 子アイテムを親フォルダへ退避
            child.parentFolder = parent;
        }

        // 中身を出し終えたら、フォルダを削除
        folder.remove();
    }

    app.endUndoGroup();
})();
