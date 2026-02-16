/* 
  Move Selected Project Items to Folder (AE ScriptUI) — silent result
  - プロジェクトパネル選択項目を指定フォルダへ移動
  - TreeViewでフォルダ選択 / 新規フォルダ作成
  - Undo対応、自己/子孫フォルダへの移動ブロック
  - 実行後の結果ポップアップ（alert）を表示しない版

  Tested: After Effects 2020–2025
*/
(function moveToFolder(){
    if (!app.project) { alert("プロジェクトが開かれていません。"); return; }

    // --- helpers ------------------------------------------------------------
    function getSelection(){
        var sel = app.project.selection || [];
        return sel; // CompItem / FootageItem / FolderItem 混在
    }

    function collectFoldersRec(root){
        var list = [];
        function walk(folder){
            list.push(folder);
            for (var i=1; i<=folder.numItems; i++){
                var it = folder.item(i);
                if (it instanceof FolderItem) walk(it);
            }
        }
        walk(root);
        return list;
    }

    // target が candidate の子孫か？
    function isDescendant(targetFolder, candidateAncestor){
        var f = targetFolder;
        while (f && f !== app.project.rootFolder){
            if (f === candidateAncestor) return true;
            f = f.parentFolder;
        }
        return false;
    }

    function buildDialog(preselectFolder){
        var dlg = new Window('dialog', 'コレクションへ移動（フォルダ選択）');
        dlg.orientation = 'column';
        dlg.alignChildren = ['fill','fill'];

        var info = dlg.add('statictext', undefined, '移動先フォルダを選択（右クリックで展開/折りたたみ）');
        info.characters = 40;

        var tree = dlg.add('treeview', undefined, []);
        tree.preferredSize = [420, 320];

        var btns = dlg.add('group');
        btns.alignment = ['fill','bottom'];
        var btnNew = btns.add('button', undefined, '新規フォルダ...');
        var ok   = btns.add('button', undefined, 'OK', {name:'ok'});
        var cancel = btns.add('button', undefined, 'キャンセル', {name:'cancel'});

        // ツリー構築
        function addNode(folder, parentNode){
            var node = parentNode ? parentNode.add('node', folder.name) : tree.add('node', folder.name);
            node.folderRef = folder;
            for (var i=1; i<=folder.numItems; i++){
                var it = folder.item(i);
                if (it instanceof FolderItem) addNode(it, node);
            }
            return node;
        }

        var root = app.project.rootFolder;
        var rootNode = addNode(root, null);
        rootNode.expanded = true;

        // 既定選択：preselectFolder があればそこを選択
        if (preselectFolder){
            function findNode(n){
                if (n.folderRef === preselectFolder) return n;
                for (var i=0; i<n.items.length; i++){
                    var r = findNode(n.items[i]);
                    if (r) return r;
                }
                return null;
            }
            var pre = findNode(rootNode);
            if (pre){
                var p = pre;
                while (p){ p.expanded = true; p = p.parent; }
                tree.selection = pre;
            }
        }

        // 新規フォルダ
        btnNew.onClick = function(){
            var baseNode = tree.selection || rootNode;
            var baseFolder = baseNode.folderRef;
            var name = prompt("新規フォルダ名", "New Folder");
            if (!name) return;

            app.beginUndoGroup("新規フォルダ作成");
            var newF = app.project.items.addFolder(name);
            newF.parentFolder = baseFolder;
            app.endUndoGroup();

            var n = addNode(newF, baseNode);
            baseNode.expanded = true;
            tree.selection = n;
        };

        dlg.selectedFolder = null;
        tree.onChange = function(){
            dlg.selectedFolder = tree.selection ? tree.selection.folderRef : null;
        };

        ok.onClick = function(){
            if (!tree.selection){ alert("移動先フォルダを選択してください。"); return; }
            dlg.selectedFolder = tree.selection.folderRef;
            dlg.close(1);
        };
        cancel.onClick = function(){ dlg.close(0); };

        return dlg;
    }

    // --- main ---------------------------------------------------------------
    var sel = getSelection();
    if (!sel || sel.length === 0){
        alert("まず、プロジェクトパネルで移動したい項目を選択してください。");
        return;
    }

    var preFolder = sel[0] && sel[0].parentFolder ? sel[0].parentFolder : app.project.rootFolder;

    var dlg = buildDialog(preFolder);
    var ok = dlg.show();
    if (ok !== 1) return;

    var dst = dlg.selectedFolder || app.project.rootFolder;

    // 実行
    app.beginUndoGroup("Move to Folder");
    var moved = 0, skipped = 0, skippedNames = [];

    for (var i=0; i<sel.length; i++){
        var it = sel[i];

        // 同じ場所はスキップ
        if (it.parentFolder === dst){ skipped++; skippedNames.push(it.name + "（同じ場所）"); continue; }

        // フォルダを自身/子孫へは不可
        if (it instanceof FolderItem){
            if (isDescendant(dst, it)){
                skipped++; skippedNames.push(it.name + "（自身/子孫への移動は不可）");
                continue;
            }
        }
        try{
            it.parentFolder = dst;
            moved++;
        }catch(e){
            skipped++; skippedNames.push(it.name + "（エラー: " + e.toString() + "）");
        }
    }
    app.endUndoGroup();

    // ===== サイレント化：ポップアップを表示しない =====
    // 代わりにコンソールへ結果を出力（必要ならInfoパネルで確認）
    try {
        $.writeln("[AE_m] 移動: " + moved + " 件"
            + (skipped > 0 ? " / スキップ: " + skipped + " 件 — " + skippedNames.join(", ") : ""));
    } catch(e) {
        // 何もしない（完全サイレント）
    }
})();
