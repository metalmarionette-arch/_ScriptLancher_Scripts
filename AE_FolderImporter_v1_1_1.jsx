// AE_FolderImporter_v1_1_0_nodup.jsx
// フォルダ素材読み込み専用（単独連番/静止画の直上取り込み対応）
// 既存フォルダ/既存フッテージを再利用して重複インポートしない版
// -------------------------------------------------------------
(function () {
    var GLOBAL_KEY = "__AE_FolderImporter_v1_1_1_UI__";
    if (!($.global[GLOBAL_KEY] === undefined || $.global[GLOBAL_KEY] === null)) {
        try {
            $.global[GLOBAL_KEY].show();
            $.global[GLOBAL_KEY].active = true;
        } catch (_reuseErr) {}
        return;
    }

    // ---------- UI ----------
    var win = new Window("palette", "フォルダ素材読み込み (v1.1.1, no-dup)", undefined, {resizeable:true});
    $.global[GLOBAL_KEY] = win;
    win.onClose = function () {
        try { $.global[GLOBAL_KEY] = null; } catch (_closeErr) {}
    };
    win.orientation = "column";
    win.alignChildren = "fill";

    var pImp = win.add("panel", undefined, "読み込み");
    pImp.orientation = "column"; pImp.alignChildren = "left";
    var gImpPath = pImp.add("group"); gImpPath.add("statictext", undefined, "パス:");
    var tImpPath = gImpPath.add("edittext", undefined, ""); tImpPath.characters = 44;
    var bImpRef = gImpPath.add("button", undefined, "参照");
    var gImpOpt = pImp.add("group");
    var cImpRec = gImpOpt.add("checkbox", undefined, "サブフォルダも含める"); cImpRec.value = true;
    var cImpPack = gImpOpt.add("checkbox", undefined, "末端が単独の連番ならまとめて読み込み");
    var cImpSingleStill = gImpOpt.add("checkbox", undefined, "末端が単独の静止画ならまとめて読み込み");
    var bImport = pImp.add("button", undefined, "読み込み");

    if (win instanceof Window) { win.center(); win.show(); }

    // ---------- UI handlers ----------
    bImpRef.onClick = function(){
        var f = Folder.selectDialog("読み込むフォルダを選択");
        if (f) tImpPath.text = decodeURI(f.fsName);
    };

    bImport.onClick = function(){
        var p = tImpPath.text;
        if (!p || !(new Folder(p)).exists){ alert("有効なフォルダを指定してください"); return; }

        app.beginUndoGroup("フォルダ素材読み込み");
        try{
            var srcFolder = new Folder(p);
            var newName   = srcFolder.name;

            // 読み込みオプション
            var doRecursive      = cImpRec.value;
            var packSingleSeq    = cImpPack.value;         // 「末端が単独の連番ならまとめて読み込み」
            var packSingleStill  = cImpSingleStill.value;  // 「末端が単独の静止画ならまとめて読み込み」

            // 1) AE側の選択から格納先の親フォルダを決定
            var sel = app.project.selection;
            var destParent = null;
            if (sel && sel.length === 1){
                try{
                    if (sel[0] instanceof FolderItem)      destParent = sel[0];
                    else if (sel[0].parentFolder)          destParent = sel[0].parentFolder;
                }catch(_e){}
            }
            var topParent = destParent ? destParent : app.project.rootFolder; // 直上親（なければトップ）

            // 2) 「対象フォルダ自体」が単独連番/単独静止画のみかの判定 → 対応オプションがONなら直上へ直接取り込み
            var ana = analyzeFolderForSingleContent(srcFolder);
            if (ana.isLeaf && packSingleSeq && ana.isSingleSeq){
                importSeq(ana.seq, topParent);
                alert("読み込み完了（単独連番を直上にまとめて読み込み）");
                return;
            }
            if (ana.isLeaf && packSingleStill && ana.isSingleStill){
                importFile(ana.still, topParent);
                alert("読み込み完了（単独静止画を直上にまとめて読み込み）");
                return;
            }

            // 3) 通常処理（必要ならAE内フォルダを作る／既存を再利用）
            var root = getOrCreateChildFolder(topParent, newName);

            // 4) 取り込み
            if (doRecursive){
                importFolderRecursive(srcFolder, root, packSingleSeq, packSingleStill, true);
            }else{
                importFolderFlat(srcFolder, root, packSingleSeq, packSingleStill);
            }

            alert("読み込み完了");
        }catch(e){
            alert("読み込み中にエラー: " + e);
        } finally {
            app.endUndoGroup();
        }
    };

    // ---------- Helpers ----------
    function isImportable(file){
        var allow = {
            "jpg":1,"jpeg":1,"png":1,"tif":1,"tiff":1,"tga":1,"bmp":1,"gif":1,
            "psd":1,"ai":1,"eps":1,"pdf":1,
            "mov":1,"mp4":1,"avi":1,"wmv":1,"mxf":1,"mpg":1,"mpeg":1,"m4v":1,"flv":1,
            "wav":1,"aif":1,"aiff":1,"mp3":1,
            "exr":1,"dpx":1,"cin":1,"r3d":1,"ari":1
        };
        var n = file.name.toLowerCase();
        var i = n.lastIndexOf(".");
        if (i < 0) return false;
        var ext = n.substring(i+1);
        return !!allow[ext];
    }

    function filterImportable(arr){
        var out = [];
        for (var i=0;i<arr.length;i++) {
            if (isImportable(arr[i])) out.push(arr[i]);
        }
        return out;
    }

    function listFilesAndDirs(folder){
        var all = folder.getFiles(), files = [], dirs = [];
        for (var i=0;i<all.length;i++){
            if (all[i] instanceof File) files.push(all[i]);
            else if (all[i] instanceof Folder) dirs.push(all[i]);
        }
        return {files:files, dirs:dirs};
    }

    function detectSeq(files){
        var out = [], used = {};
        for (var i=0;i<files.length;i++){
            if (used[files[i].fsName]) continue;
            var m = files[i].name.match(/^(.*?)[._-]?(\d{3,})\.(\w+)$/i);
            if (!m) continue;
            var prefix = m[1], digits = m[2].length, ext = m[3];
            var esc = prefix.replace(/([.*+?^${}()|[\]\/\\])/g,"\\$1");
            var pat = new RegExp("^" + esc + "[._-]?(\\d{"+digits+"})\\." + ext + "$", "i");
            var grp = [];
            for (var j=0;j<files.length;j++){
                if (pat.test(files[j].name)){
                    grp.push(files[j]);
                    used[files[j].fsName]=1;
                }
            }
            if (grp.length>1){
                grp.sort(function(a,b){ return a.name<b.name?-1:1; });
                out.push(grp);
            }
        }
        return out;
    }

    // ---------- 追加: 既存フォルダ／既存フッテージを探す ----------
    function findExistingFolder(parentFolder, name){
        for (var i = 1; i <= app.project.items.length; i++){
            var it = app.project.items[i];
            if ((it instanceof FolderItem) && it.parentFolder === parentFolder && it.name === name){
                return it;
            }
        }
        return null;
    }

    function getOrCreateChildFolder(parentFolder, name){
        var f = findExistingFolder(parentFolder, name);
        if (f) return f;
        var nf = app.project.items.addFolder(name);
        nf.parentFolder = parentFolder;
        return nf;
    }

    function existsFootageForFile(file){
        if (!file) return null;
        var target = file.fsName;
        for (var i = 1; i <= app.project.items.length; i++){
            var it = app.project.items[i];
            if (it instanceof FootageItem && it.file){
                try{
                    if (it.file.fsName === target){
                        return it;
                    }
                }catch(e){}
            }
        }
        return null;
    }

    // ---------- インポート処理 ----------
    function importFile(file, parent){
        try{
            // すでに同じファイルパスのフッテージがある場合は読み込まない
            if (existsFootageForFile(file)){
                // 既存フッテージの親フォルダを変更したい場合はここで処理を追加
                // 今回は「重複インポートしない」だけなので何もしない
                return;
            }
            var io = new ImportOptions(file);
            var it = app.project.importFile(io);
            it.parentFolder = parent;
        }catch(e){}
    }

    function importSeq(seq, parent){
        try{
            if (!seq || seq.length === 0) return;

            // シーケンスの起点ファイルで重複チェック
            if (existsFootageForFile(seq[0])){
                return;
            }

            var io = new ImportOptions(seq[0]);
            io.sequence = true;
            var it = app.project.importFile(io);
            it.parentFolder = parent;
        }catch(e){}
    }

    function analyzeFolderForSingleContent(folder){
        var ld = listFilesAndDirs(folder);
        var files = filterImportable(ld.files);
        var isLeaf = (ld.dirs.length === 0);

        var seqs = detectSeq(files);
        var isSingleSeq   = (seqs.length === 1 && seqs[0].length === files.length);
        var isSingleStill = (files.length === 1);

        return {
            isLeaf: isLeaf,
            isSingleSeq: isSingleSeq,
            seq: isSingleSeq ? seqs[0] : null,
            isSingleStill: isSingleStill,
            still: isSingleStill ? files[0] : null
        };
    }

    function importFolderRecursive(folder, parent, packSingleSeq, packSingleStill, isRoot){
        var ld = listFilesAndDirs(folder);
        var files = filterImportable(ld.files), dirs = ld.dirs;

        // 末端フォルダ（サブフォルダなし）での“まとめて”判定
        if (dirs.length === 0){
            // 1) 単独連番なら → 親へ直接シーケンス読み込み
            if (packSingleSeq){
                var sLeaf = detectSeq(files);
                if (sLeaf.length === 1 && sLeaf[0].length === files.length){
                    importSeq(sLeaf[0], parent);
                    return;
                }
            }
            // 2) 単独静止画なら → 親へ直接1枚読み込み（フォルダ作らない）
            if (packSingleStill){
                if (files.length === 1){
                    importFile(files[0], parent);
                    return;
                }
            }
        }

        // ここまで該当しなければ通常処理（必要ならAE内フォルダを作る／既存を再利用）
        var here;
        if (isRoot){
            here = parent;
        }else{
            here = getOrCreateChildFolder(parent, folder.name);
        }

        // フォルダ内の連番はフォルダ内に通常インポート
        var seqs = detectSeq(files), inSeq = {};
        for (var i=0; i<seqs.length; i++){
            importSeq(seqs[i], here);
            for (var k=0; k<seqs[i].length; k++) inSeq[seqs[i][k].fsName] = 1;
        }
        // 非連番のファイルを通常インポート
        for (var j=0; j<files.length; j++){
            if (!inSeq[files[j].fsName]) importFile(files[j], here);
        }
        // サブフォルダ再帰
        for (var d=0; d<dirs.length; d++){
            importFolderRecursive(dirs[d], here, packSingleSeq, packSingleStill, false);
        }
    }

    function importFolderFlat(folder, parent, packSingleSeq, packSingleStill){
        var ld = listFilesAndDirs(folder);
        var files = filterImportable(ld.files);

        // “まとめて”判定（フラット読み込みでも同様）
        if (packSingleSeq){
            var sFlat = detectSeq(files);
            if (sFlat.length === 1 && sFlat[0].length === files.length){
                importSeq(sFlat[0], parent);
                return;
            }
        }
        if (packSingleStill){
            if (files.length === 1){
                importFile(files[0], parent);
                return;
            }
        }

        // 通常のフラット読み込み
        var seqs = detectSeq(files), inSeq = {};
        for (var i=0; i<seqs.length; i++){
            importSeq(seqs[i], parent);
            for (var k=0; k<seqs[i].length; k++) inSeq[seqs[i][k].fsName] = 1;
        }
        for (var j=0; j<files.length; j++){
            if (!inSeq[files[j].fsName]) importFile(files[j], parent);
        }
    }
})();
