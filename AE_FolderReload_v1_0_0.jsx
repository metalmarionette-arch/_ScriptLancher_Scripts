// AE_FolderReload_v1_0_0.jsx
// 選択したAEフォルダ配下のフッテージ一括再読み込み専用
// -------------------------------------------------------------
(function () {
    // ---------- UI ----------
    var win = new Window("palette", "フッテージ一括再読み込み (v1.0.0)", undefined, {resizeable:true});
    win.orientation = "column";
    win.alignChildren = "fill";

    var pRel = win.add("panel", undefined, "再読み込み（プロジェクトで“AEフォルダ”を1つ選択）");
    pRel.orientation = "column"; 
    pRel.alignChildren = "left";

    pRel.add("statictext", undefined, "選択したAEフォルダ配下の Footage を一括で再読み込みします。");

    var gRelOpt = pRel.add("group");
    var cRelOnlyExists = gRelOpt.add("checkbox", undefined, "元ファイルが存在するものだけ（推奨）");
    cRelOnlyExists.value = true;

    var bReload = pRel.add("button", undefined, "選択AEフォルダのフッテージ再読み込み");

    if (win instanceof Window) { win.center(); win.show(); }

    // ---------- UI handlers ----------
    bReload.onClick = function () {
        var sel = app.project.selection;
        if (!sel || sel.length !== 1 || !(sel[0] instanceof FolderItem)) {
            alert("プロジェクトパネルで“AEフォルダ”を1つ選択してください");
            return;
        }
        app.beginUndoGroup("フッテージ一括再読み込み");
        try {
            var msg = reloadAllUnderFolder(sel[0], { onlyExists: cRelOnlyExists.value });
            alert(msg);
        } catch (e) {
            alert("再読み込み中にエラー: " + e);
        }
        app.endUndoGroup();
    };

    // ---------- Helpers ----------
    function collectFootageUnder(folderItem){
        var out = [];
        for (var i=1;i<=app.project.numItems;i++){
            var it = app.project.item(i);
            if (it.parentFolder && it.parentFolder.id === folderItem.id){
                if (it instanceof FootageItem) out.push(it);
                else if (it instanceof FolderItem){
                    var sub = collectFootageUnder(it);
                    for (var k=0;k<sub.length;k++) out.push(sub[k]);
                }
            }
        }
        return out;
    }

    function reloadAllUnderFolder(targetAEFolder, opt) {
        opt = opt || {};
        var onlyExists = !!opt.onlyExists;

        var targets = collectFootageUnder(targetAEFolder);
        if (!targets || !targets.length) return "対象無し（Footageが見つかりません）";

        var OK = 0, NG = 0, SK = 0;
        for (var i = 0; i < targets.length; i++) {
            var it = targets[i];
            var file = null;
            try { if (it.mainSource && it.mainSource.file) file = it.mainSource.file; } catch (_e) {}

            if (onlyExists && (!file || !file.exists)) {
                SK++; // スキップ
                continue;
            }

            try {
                it.reload(); // 連番含む
                OK++;
            } catch (e) {
                try {
                    if (it.mainSource && typeof it.mainSource.reload === "function") {
                        it.mainSource.reload();
                        OK++;
                    } else {
                        NG++;
                    }
                } catch (_e2) {
                    NG++;
                }
            }
        }

        return "再読み込み完了\n  成功:" + OK + "  失敗:" + NG + "  スキップ:" + SK
            + (onlyExists ? "\n（オプション: 元ファイルが存在するものだけ）" : "");
    }
})();