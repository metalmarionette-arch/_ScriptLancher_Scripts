// AE_FootageReplacer_v1_1_3.jsx
// 素材一括置き換え（フォルダキー整合パッチ版）
// 変更点（v1.1.2 → v1.1.3）:
//  - フォルダキーの照合に「先頭の AAA_mdlXX_ を除去したキー」を追加
//    例: "AAA_mdl17_bg_a_image" → "bg_a_image" を新規に試行
//  - これにより、新側ルートのキー構成（"bg_a_image"）とのミスマッチを解消
//  - 既存のトークン置換（AAA_mdl17→AAA_mdl20、mdl17→mdl20）と名前キー照合は従来通り
(function () {
    var win = new Window("palette", "素材一括置き換え (v1.1.3)", undefined, {resizeable:true});
    win.orientation = "column"; win.alignChildren = "fill";

    var pRep = win.add("panel", undefined, "置き換え（プロジェクトで“旧素材ルートAEフォルダ”を1つ選択）");
    pRep.orientation = "column"; pRep.alignChildren = "left";
    pRep.add("statictext", undefined, "※ 新フォルダは例：…\\images\\AAA_mdl20\\ を指定（検索優先でもOK）");

    var gNew = pRep.add("group"); gNew.add("statictext", undefined, "新フォルダ:");
    var tNewRoot = gNew.add("edittext", undefined, ""); tNewRoot.characters = 44;
    var bNewRef = gNew.add("button", undefined, "参照");

    var gKey = pRep.add("group");
    var cUseFolder = gKey.add("checkbox", undefined, "フォルダ構成優先"); cUseFolder.value = true;
    var cUseName   = gKey.add("checkbox", undefined, "ファイル名論理キー併用"); cUseName.value = true;
    var cDebugLog  = gKey.add("checkbox", undefined, "詳細ログを保存（Desktop/AE_Replace_Log.txt）"); cDebugLog.value = true;

    var cForceReplace = pRep.add("checkbox", undefined, "パス置換を使わず、新フォルダから検索して差し替え（replace）する");
    cForceReplace.value = true;
    var cAllowExtMismatch = pRep.add("checkbox", undefined, "拡張子ちがいも許可（例：.mov → .mp4）");
    cAllowExtMismatch.value = true;
    var cDryRun    = pRep.add("checkbox", undefined, "ドライラン（置換せず候補探索のみ）");
    cDryRun.value = false;

    var pMap = pRep.add("panel", undefined, "パス置換（旧→新の大枠パス）");
    pMap.orientation = "column"; pMap.alignChildren = "left";
    var gOldB = pMap.add("group"); gOldB.add("statictext", undefined, "旧ベース:");
    var tOldBase = gOldB.add("edittext", undefined, ""); tOldBase.characters = 44;
    var bOldRef = gOldB.add("button", undefined, "参照");
    var gNewB = pMap.add("group"); gNewB.add("statictext", undefined, "新ベース:");
    var tNewBase = gNewB.add("edittext", undefined, ""); tNewBase.characters = 44;
    var bNewBRef = gNewB.add("button", undefined, "参照");
    var cPathSub = pMap.add("checkbox", undefined, "パス置換を優先して試す（旧ベース→新ベース）");
    cPathSub.value = true;

    var bReplace = pRep.add("button", undefined, "置き換え");

    if (win instanceof Window) { win.center(); win.show(); }

    bNewRef.onClick = function(){ var f = Folder.selectDialog("新しい素材のルートフォルダを選択"); if (f) tNewRoot.text = decodeURI(f.fsName); };
    bOldRef.onClick = function(){ var f = Folder.selectDialog("旧ベースパスを選択"); if (f) tOldBase.text = decodeURI(f.fsName); };
    bNewBRef.onClick = function(){ var f = Folder.selectDialog("新ベースパスを選択"); if (f) tNewBase.text = decodeURI(f.fsName); };

    bReplace.onClick = function(){
        var newRoot = tNewRoot.text;
        if (!newRoot || !(new Folder(newRoot)).exists){ alert("有効な新フォルダを指定してください"); return; }
        var sel = app.project.selection;
        if (!sel || sel.length !== 1 || !(sel[0] instanceof FolderItem)){
            alert("プロジェクトパネルで“旧素材ルートAEフォルダ”を1つ選択してください");
            return;
        }
        var pathOpt = { doSub: cPathSub.value, oldBase: tOldBase.text, newBase: tNewBase.text };
        app.beginUndoGroup("素材の一括置き換え");
        try{
            var msg = replaceAllUnderFolder(sel[0], new Folder(newRoot), cUseFolder.value, cUseName.value, pathOpt);
            alert(msg);
        }catch(e){ alert("置き換え中にエラー: " + e); }
        app.endUndoGroup();
    };

    function replaceAllUnderFolder(targetAEFolder, newRootFolder, useFolderKey, useNameKey, pathOpt){
        function _logFile(){ try { return new File(Folder.desktop.fsName + "/AE_Replace_Log.txt"); } catch(e){ return null; } }
        function _log(s){
            if (!cDebugLog.value) return;
            var f = _logFile(); if (!f) return;
            try{ if (!f.exists){ f.encoding="UTF-8"; f.open("w"); f.write(""); f.close(); }
                f.open("e"); f.seek(0,2); f.writeln(s); f.close();
            }catch(e){}
            try{ $.writeln(s); }catch(e){}
        }
        function _countProps(o){ var n=0; for (var k in o){ if (o.hasOwnProperty && o.hasOwnProperty(k)) n++; } return n; }

        pathOpt = pathOpt || {};
        function _norm(p){ var s=(p+"").replace(/\\/g,"/"); if ($.os.indexOf("Windows")>=0) s = s.toLowerCase(); return s; }
        function _ensureSlash(p){ if (!p) return ""; var s=(p+"").replace(/\\/g,"/"); if (s.charAt(s.length-1) !== "/") s += "/"; return s; }
        function _digitsSeqName(n){ return /(\d{3,})\.\w+$/i.test(n); }

        var dryRun = !!cDryRun.value;
        var preferSearchReplace = !!cForceReplace.value;
        var allowExtMismatch   = !!cAllowExtMismatch.value;

        if (!(targetAEFolder instanceof FolderItem)) return "プロジェクトで“旧素材ルートAEフォルダ”を1つ選択してください";
        if (!(newRootFolder instanceof Folder))     return "新フォルダパスが不正です";

        var oldBaseRaw = pathOpt.oldBase || "";
        var newBaseRaw = pathOpt.newBase || "";
        var doPathSub  = !!(pathOpt.doSub && oldBaseRaw && newBaseRaw && (new Folder(newBaseRaw)).exists);
        var oldBaseN   = _ensureSlash(_norm(oldBaseRaw));
        var newBaseOut = _ensureSlash(newBaseRaw.replace(/\\/g,"/"));

        function lastSeg(p){ var s=(p+"").replace(/\\/g,"/"); if (s.charAt(s.length-1)==="/") s=s.substring(0,s.length-1); var a=s.split("/"); return a.length?a[a.length-1]:""; }
        var oldLast = lastSeg(oldBaseRaw);
        var newLast = lastSeg(newBaseRaw);

        var newMdl = (newLast.match(/(mdl\d+)/i)||[])[1] || (newBaseOut.match(/(?:^|\/)(mdl\d+)(?:\/|$)/i)||[])[1] || null;

        var tokenPairs = [];
        if (oldLast && newLast && oldLast.toLowerCase() !== newLast.toLowerCase()){
            tokenPairs.push([oldLast, newLast]); // AAA_mdl17 → AAA_mdl20
        }
        if (newMdl){ tokenPairs.push([/mdl\d+/ig, newMdl]); } // mdl17 → mdl20（一般形）

        _log("=== DIAG === preferSearchReplace="+preferSearchReplace+" allowExtMismatch="+allowExtMismatch+" dryRun="+dryRun+" doPathSub="+doPathSub+" oldLast="+oldLast+" newLast="+newLast+" newMdl="+(newMdl||""));

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
        var targets = collectFootageUnder(targetAEFolder);
        if (!targets.length) return "対象無し（Footageが見つかりません）";
        _log("[1] targets="+targets.length);

        function commonRoot(paths){
            if (!paths || !paths.length) return null;
            function toParts(f){ var s=(f.fsName?f.fsName:f+"").replace(/\\/g,"/"); var raw=s.split("/"); var out=[]; for (var k=0;k<raw.length;k++){ if (raw[k] !== "") out.push(raw[k]); } return out; }
            var parts = []; for (var i=0;i<paths.length;i++) parts.push(toParts(paths[i]));
            var min = parts[0].length, j;
            for (i=1; i<parts.length; i++) if (parts[i].length<min) min = parts[i].length;
            var res = [];
            outer: for (j=0;j<min;j++){ var p = parts[0][j]; for (i=1;i<parts.length;i++){ if (parts[i][j] !== p){ break outer; } } res.push(p); }
            if (!res.length) return null;
            return res.join("/");
        }
        var oldFiles = [], i;
        for (i=0;i<targets.length;i++){ try{ if (targets[i].mainSource && targets[i].mainSource.file) oldFiles.push(targets[i].mainSource.file); }catch(_e){} }
        var oldRoot = commonRoot(oldFiles);
        _log("[2] oldRoot="+(oldRoot||"(null)"));

        function getAEPathParts(rootAEFolder, it){
            var names=[], p=it.parentFolder;
            while (p && p !== rootAEFolder && p !== app.project.rootFolder){ names.unshift(p.name); p = p.parentFolder; }
            return names;
        }

        function listFilesAndDirs(folder){
            var all = folder.getFiles(), files=[], dirs=[];
            for (var k=0;k<all.length;k++){ if (all[k] instanceof File) files.push(all[k]); else if (all[k] instanceof Folder) dirs.push(all[k]); }
            return {files:files, dirs:dirs};
        }
        function isImportable(file){
            var allow = {"jpg":1,"jpeg":1,"png":1,"tif":1,"tiff":1,"tga":1,"bmp":1,"gif":1,"psd":1,"ai":1,"eps":1,"pdf":1,
                        "mov":1,"mp4":1,"avi":1,"wmv":1,"mxf":1,"mpg":1,"mpeg":1,"m4v":1,"flv":1,
                        "wav":1,"aif":1,"aiff":1,"mp3":1,"exr":1,"dpx":1,"cin":1,"r3d":1,"ari":1};
            var n=file.name.toLowerCase(); var dot=n.lastIndexOf("."); if (dot<0) return false; var ext=n.substring(dot+1); return !!allow[ext];
        }
        function filterImportable(arr){ var out=[]; for (var q=0;q<arr.length;q++) if (isImportable(arr[q])) out.push(arr[q]); return out; }
        function detectSeq(files){
            var out=[], used={};
            for (var a=0;a<files.length;a++){
                if (used[files[a].fsName]) continue;
                var m = files[a].name.match(/^(.*?)[._-]?(\d{3,})\.(\w+)$/i);
                if (!m) continue;
                var prefix=m[1], digits=m[2].length, ext=m[3];
                var esc=prefix.replace(/([.*+?^${}()|[\]\/\\])/g,"\\$1");
                var pat=new RegExp("^"+esc+"[._-]?(\\d{"+digits+"})\\."+ext+"$","i");
                var grp=[];
                for (var b=0;b<files.length;b++){
                    if (pat.test(files[b].name)){ grp.push(files[b]); used[files[b].fsName]=1; }
                }
                if (grp.length>1){ grp.sort(function(x,y){ return x.name<y.name?-1:1; }); out.push(grp); }
            }
            return out;
        }
        function nameLogicKey(n){
            var m = n.match(/_mdl_\d+_(.+?)_\[\d+-\d+\]\.\w+$/i);
            if (m && m[1]) return (m[1]+"").toLowerCase();
            var s = n.replace(/\.\w+$/,""); s = s.replace(/_\[\d+-\d+\]$/,""); return s.toLowerCase();
        }
        function relPath(file, root){
            if (!file || !root) return null;
            var full=(file.fsName+"").replace(/\\/g,"/"); var rp=(root+"").replace(/\\/g,"/"); if (rp.charAt(rp.length-1)!=="/") rp+="/";
            if (full.indexOf(rp)===0) return full.substring(rp.length);
            return null;
        }
        function folderKeyFromRel(rel){ if (!rel) return null; var p=rel.split("/"); if (p.length<=1) return null; p.pop(); return p.join("_").toLowerCase(); }
        function stripMdlHead(fk){ return fk ? fk.replace(/^.*?mdl\d+_/i, "") : fk; } // AAA_mdl17_bg_a_image → bg_a_image

        function findChildFolderCI(parent, name){
            var kids = parent.getFiles("*"); name=(""+name).toLowerCase();
            for (var k=0;k<kids.length;k++) if (kids[k] instanceof Folder && (""+kids[k].name).toLowerCase()===name) return kids[k];
            return null;
        }
        function buildLookup(root){
            var byFolder={}, byName={};
            function addEntry(file, rel){
                var ext = file.name.replace(/^.*\./,"").toLowerCase();
                var fk  = folderKeyFromRel(rel);
                var nk  = nameLogicKey(file.name);
                if (fk) byFolder[fk+"|"+ext] = file;
                if (nk) byName[nk+"|"+ext]   = file;
            }
            function walk(cur, base){
                var ld = listFilesAndDirs(cur);
                var files = filterImportable(ld.files);
                var seqs = detectSeq(files), inSeq={};
                for (var s=0;s<seqs.length;s++){ var head=seqs[s][0]; inSeq[head.fsName]=1; addEntry(head, (base?base+"/":"")+head.name); }
                for (var f=0;f<files.length;f++){ var ff=files[f]; if (inSeq[ff.fsName]) continue; addEntry(ff, (base?base+"/":"")+ff.name); }
                for (var d=0; d<ld.dirs.length; d++){ var nb=(base?base+"/":"")+ld.dirs[d].name; walk(ld.dirs[d], nb); }
            }
            walk(root, "");
            return {byFolder:byFolder, byName:byName};
        }
        function buildLookupFromAEPaths(root, aePaths){
            var byFolder={}, byName={};
            function addEntry(file, baseParts, relParts){
                var ext = file.name.replace(/^.*\./,"").toLowerCase();
                var fk  = (baseParts.concat(relParts).join("_")+"").toLowerCase();
                var nk  = nameLogicKey(file.name);
                if (fk) byFolder[fk+"|"+ext] = file;
                if (nk) byName[nk+"|"+ext]   = file;
            }
            function walk(cur, baseParts, relParts, depth){
                if (depth>6) return;
                var ld = listFilesAndDirs(cur);
                var imp = filterImportable(ld.files);
                var seqs = detectSeq(imp), inSeq={};
                for (var s=0;s<seqs.length;s++){ var head=seqs[s][0]; addEntry(head, baseParts, relParts); inSeq[head.fsName]=1; }
                for (var f=0;f<imp.length;f++){ var ff=imp[f]; if (inSeq[ff.fsName]) continue; addEntry(ff, baseParts, relParts); }
                for (var d=0; d<ld.dirs.length; d++){ walk(ld.dirs[d], baseParts, relParts.concat([ld.dirs[d].name]), depth+1); }
            }
            for (var i2=0;i2<aePaths.length;i2++){
                var parts = aePaths[i2], cur = root, ok=true;
                for (var p=0;p<parts.length;p++){ var nxt=findChildFolderCI(cur, parts[p]); if (!nxt){ ok=false; break; } cur=nxt; }
                if (!ok) continue;
                walk(cur, parts, [], 0);
            }
            return {byFolder:byFolder, byName:byName};
        }
        function findAnyExt(map, keyPrefix){ var pref = keyPrefix+"|"; for (var k in map){ if (map.hasOwnProperty(k) && k.indexOf(pref)===0) return map[k]; } return null; }

        var aePathList=[], seen={};
        for (i=0;i<targets.length;i++){
            var parts = getAEPathParts(targetAEFolder, targets[i]);
            if (!parts || !parts.length) continue;
            var key = parts.join("\n").toLowerCase();
            if (!seen[key]){ aePathList.push(parts); seen[key]=1; }
        }
        var lookup = buildLookupFromAEPaths(newRootFolder, aePathList);
        var cntF = _countProps(lookup.byFolder), cntN=_countProps(lookup.byName);
        _log("[4] smart-lookup byFolder="+cntF+" byName="+cntN);
        if (cntF===0 && cntN===0){ _log("[4] fallback full-scan"); lookup = buildLookup(newRootFolder); }

        function applyTokenPairs(s){
            var out = s;
            for (var i=0;i<tokenPairs.length;i++){
                var a = tokenPairs[i][0], b = tokenPairs[i][1];
                if (a instanceof RegExp) out = out.replace(a, b);
                else {
                    var ai = a.toLowerCase();
                    var low = out.toLowerCase();
                    var idx = low.indexOf(ai);
                    if (idx >= 0){
                        out = out.substring(0, idx) + b + out.substring(idx + a.length);
                    }
                }
            }
            return out;
        }

        function tryPathSub(it){
            if (!doPathSub) return {done:false};
            var file=null; try{ file = it.mainSource.file; }catch(_e){}
            if (!file) return {done:false};

            var fullRaw = (file.fsName+"").replace(/\\/g,"/");
            var fullNorm = _norm(fullRaw);
            if (fullNorm.indexOf(oldBaseN)!==0) return {done:false};

            var suffix = fullRaw.substring(oldBaseN.length);
            var cand = new File(newBaseOut + suffix);
            if (!cand.exists){
                var suffix2 = applyTokenPairs(suffix);
                if (suffix2 !== suffix){
                    var cand2 = new File(newBaseOut + suffix2);
                    if (cand2.exists) cand = cand2;
                }
            }
            if (cand.exists){
                if (dryRun){ _log("[DRY] via=PathSub new="+cand.fsName); return {done:true, ok:true}; }
                try{
                    _log("[DO ] via=PathSub new="+cand.fsName);
                    if (_digitsSeqName(cand.name)) it.replaceWithSequence(cand, true); else it.replace(cand);
                    return {done:true, ok:true};
                }catch(e){ _log("[ERR] PathSub replace failed: "+e); return {done:true, ok:false}; }
            }else{
                _log("[5] PathSub not found: " + (newBaseOut + suffix) + "  (replaced=" + applyTokenPairs(suffix) + ")");
                return {done:false};
            }
        }

        function trySearch(it){
            var file=null; try{ file = it.mainSource.file; }catch(_e){}
            if (!file || !file.exists){ return {ok:0, ng:0, sk:1}; }
            var ext = (file.name.replace(/^.*\./,"")||"").toLowerCase();

            var rel = oldRoot ? relPath(file, oldRoot) : null;
            var relAlt = rel ? applyTokenPairs(rel) : null;
            var fkR = folderKeyFromRel(rel);
            var fkR2 = folderKeyFromRel(relAlt);
            var fkR_stripped  = stripMdlHead(fkR);
            var fkR2_stripped = stripMdlHead(fkR2);
            var fkAE = (function(){ var p = getAEPathParts(targetAEFolder, it); return p.length ? (p.join("_")+"").toLowerCase() : null; })();

            var nk = nameLogicKey(file.name);
            var nk2 = nameLogicKey(applyTokenPairs(file.name));

            var cand=null, via="";
            // 1) フォルダキー（相対→新側形式）
            if (useFolderKey && fkR && lookup.byFolder[fkR+"|"+ext]){ cand = lookup.byFolder[fkR+"|"+ext]; via="FolderKey(rel)"; }
            else if (useFolderKey && fkR2 && lookup.byFolder[fkR2+"|"+ext]){ cand = lookup.byFolder[fkR2+"|"+ext]; via="FolderKey(rel+token)"; }
            else if (useFolderKey && fkR_stripped && lookup.byFolder[fkR_stripped+"|"+ext]){ cand = lookup.byFolder[fkR_stripped+"|"+ext]; via="FolderKey(rel stripped)"; }
            else if (useFolderKey && fkR2_stripped && lookup.byFolder[fkR2_stripped+"|"+ext]){ cand = lookup.byFolder[fkR2_stripped+"|"+ext]; via="FolderKey(rel+token stripped)"; }
            // 2) AE側パス（浅め）
            else if (useFolderKey && fkAE && lookup.byFolder[fkAE+"|"+ext]){ cand = lookup.byFolder[fkAE+"|"+ext]; via="FolderKey(AE)"; }
            // 3) 名前キー
            else if (useNameKey   && nk  && lookup.byName[nk+"|"+ext])  { cand = lookup.byName[nk+"|"+ext];   via="NameKey"; }
            else if (useNameKey   && nk2 && lookup.byName[nk2+"|"+ext]) { cand = lookup.byName[nk2+"|"+ext];  via="NameKey(token)"; }

            // 拡張子ちがい許可
            if (!cand && allowExtMismatch){
                if (useFolderKey && fkR){ cand = findAnyExt(lookup.byFolder, fkR); if (cand) via="FolderKey(rel)+AnyExt"; }
                if (!cand && useFolderKey && fkR2){ cand = findAnyExt(lookup.byFolder, fkR2); if (cand) via="FolderKey(rel+token)+AnyExt"; }
                if (!cand && useFolderKey && fkR_stripped){ cand = findAnyExt(lookup.byFolder, fkR_stripped); if (cand) via="FolderKey(rel stripped)+AnyExt"; }
                if (!cand && useFolderKey && fkR2_stripped){ cand = findAnyExt(lookup.byFolder, fkR2_stripped); if (cand) via="FolderKey(rel+token stripped)+AnyExt"; }
                if (!cand && useFolderKey && fkAE){ cand = findAnyExt(lookup.byFolder, fkAE); if (cand) via="FolderKey(AE)+AnyExt"; }
                if (!cand && useNameKey && nk){ cand = findAnyExt(lookup.byName, nk); if (cand) via="NameKey+AnyExt"; }
                if (!cand && useNameKey && nk2){ cand = findAnyExt(lookup.byName, nk2); if (cand) via="NameKey(token)+AnyExt"; }
            }

            if (!cand){ _log("[5] → NG  (search) fkR="+fkR+" fkR2="+fkR2+" fkR_stripped="+fkR_stripped+" fkR2_stripped="+fkR2_stripped+" fkAE="+fkAE+" nk="+nk+" nk2="+nk2); return {ok:0, ng:1, sk:0}; }

            if (dryRun){ _log("[DRY] via="+via+" new="+cand.fsName); return {ok:1, ng:0, sk:0}; }
            try{
                _log("[DO ] via="+via+" new="+cand.fsName);
                if (_digitsSeqName(cand.name)) it.replaceWithSequence(cand, true); else it.replace(cand);
                return {ok:1, ng:0, sk:0};
            }catch(e){
                _log("[ERR] replace failed: "+e);
                return {ok:0, ng:1, sk:0};
            }
        }

        var OK=0, NG=0, SK=0;
        for (i=0;i<targets.length;i++){
            var it = targets[i];
            if (preferSearchReplace){
                var rs = trySearch(it); OK+=rs.ok; NG+=rs.ng; SK+=rs.sk;
                if (!rs.ok){ var rp = tryPathSub(it); if (rp.done){ if (rp.ok) OK++; else NG++; } else { NG++; } }
            }else{
                var rp2 = tryPathSub(it);
                if (rp2.done){ if (rp2.ok){ OK++; } else { NG++; } }
                else { var rs2 = trySearch(it); OK+=rs2.ok; NG+=rs2.ng; SK+=rs2.sk; }
            }
        }
        _log("=== DONE === OK:"+OK+" NG:"+NG+" SK:"+SK);
        return (dryRun?"ドライラン完了":"置き換え完了")
            + "\n 成功:"+OK+" 失敗:"+NG+" スキップ:"+SK
            + "\n(検索優先="+preferSearchReplace+", PathSub="+doPathSub+", FolderKey="+useFolderKey+", NameKey="+useNameKey+", AnyExt="+allowExtMismatch+")";
    }
})();