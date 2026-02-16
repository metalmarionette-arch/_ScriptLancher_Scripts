/*
  Puppet Pins → Nulls (reuse & fixed names, safe)
  - Puppet(FreePin 旧/新)から各「PosPin Position」を検出
  - ヌル名: 「ヌル_メッシュX_パペットピンY」
    * 既に存在すれば再利用、無ければ初回だけ新規作成
  - 初期配置: sourcePointToComp([x,y])
  - ピンPosition式: thisLayer.fromComp( ctrl.toComp(ctrl.anchorPoint) )
*/
(function () {
    app.beginUndoGroup("Puppet Pins → Nulls (reuse & fixed names)");

    var comp = app.project && app.project.activeItem;
    if (!(comp && comp instanceof CompItem)) { alert("コンポが見つかりません。"); app.endUndoGroup(); return; }

    var sel = comp.selectedLayers;
    if (!sel || sel.length === 0) { alert("パペット適用レイヤーを選択してください。"); app.endUndoGroup(); return; }

    // ===== 設定 =====
    var parentNullsToSource = true;   // ヌルを元レイヤーの子にする
    var nullLabelColorIndex = 10;     // コントローラ色
    var prefixBySourceLayer = false;  // true にすると: ヌル_<元レイヤー名>_メッシュX_パペットピンY

    // ===== ユーティリティ =====
    function esc(s){ return (""+s).replace(/\\/g,"\\\\").replace(/"/g,'\\"'); }
    function isPuppet(eff){ return eff && eff.matchName && eff.matchName.indexOf("ADBE FreePin") === 0; }
    function isGroup(p){ return p && (p.propertyType === PropertyType.INDEXED_GROUP || p.propertyType === PropertyType.NAMED_GROUP); }
    function isLeaf(p){ return p && p.propertyType === PropertyType.PROPERTY; }
    function eachChild(g, fn){ var n=g.numProperties||0; for (var i=1;i<=n;i++){ var c=g.property(i); if(c) fn(c,i);} }

    // 正規表現を使わずに危険文字を除去/置換（ExtendScriptのパーサ対策）
    function normalizeName(s){
        var t = String(s || "");
        // 1) 全ての空白を削除
        t = t.replace(/\s+/g, "");
        // 2) NG 文字を順に "_" に置換
        var bad = ['\\','/',';',':','*','?','"','<','>','|','#','%'];
        for (var i=0;i<bad.length;i++){
            var ch = bad[i];
            // split-join 方式で置換（正規表現不使用）
            t = t.split(ch).join("_");
        }
        // 3) "_" の重複と末尾整理
        while (t.indexOf("__") !== -1) t = t.split("__").join("_");
        if (t.substr(t.length-1) === "_") t = t.substr(0, t.length-1);
        return t;
    }

    function makeNullName(srcLayer, meshName, pinName){
        var base = "ヌル_" + (prefixBySourceLayer ? (normalizeName(srcLayer.name) + "_") : "")
                 + normalizeName(meshName || "") + "_" + normalizeName(pinName || "");
        // 連続/先頭の整理
        while (base.indexOf("__") !== -1) base = base.split("__").join("_");
        if (base.substr(base.length-1) === "_") base = base.substr(0, base.length-1);
        return base;
    }

    function isPosPinPositionMatch(mn){
        return mn === "ADBE FreePin3 PosPin Position" ||
               mn === "ADBE FreePin2 PosPin Position" ||
               mn === "ADBE FreePin PosPin Position";
    }

    function findMeshNameFrom(prop){
        var p = prop;
        while (p){
            try{
                if (p.matchName && /ADBE\s+FreePin\d*\s+Mesh/i.test(p.matchName)) return p.name;
                p = p.parentProperty;
            }catch(e){ break; }
        }
        return "";
    }

    // Puppet効果配下を走査して「PosPin Position」を収集
    function collectPinPositions(eff){
        var out = [];
        (function walk(node){
            if (!node) return;
            var n = node.numProperties ? node.numProperties : 0;
            if (n > 0){
                for (var i=1;i<=n;i++) walk(node.property(i));
            } else {
                var mn = node.matchName ? node.matchName : "";
                if (isPosPinPositionMatch(mn)){
                    var pinGroup = node.parentProperty;             // PosPin Atom
                    var pinName  = pinGroup ? pinGroup.name : "Pin";
                    var meshName = findMeshNameFrom(pinGroup);
                    out.push({ posProp: node, pinName: pinName, meshName: meshName });
                }
            }
        })(eff);
        return out;
    }

    function getOrCreateNull(comp, srcLayer, name, compPos){
        var ctrl = comp.layer(name), created = false;
        if (!ctrl){
            ctrl = comp.layers.addNull();
            created = true;
            ctrl.name = name;
            ctrl.threeDLayer = false;
            ctrl.label = nullLabelColorIndex;
            try{
                ctrl.inPoint  = Math.max(comp.displayStartTime, srcLayer.inPoint);
                ctrl.outPoint = Math.min(comp.duration,       srcLayer.outPoint);
            }catch(e){}
        }
        // 位置更新（再利用でも最新のピン位置へ）
        ctrl.position.setValue([compPos[0], compPos[1]]);
        // 親子付け
        if (parentNullsToSource){
            try { ctrl.setParentWithJump(srcLayer); } catch (e) { ctrl.parent = srcLayer; }
        } else {
            ctrl.parent = null;
        }
        return { layer: ctrl, created: created };
    }

    // ===== メイン =====
    var MADE=0, REUSED=0, LINKED=0, t = comp.time;

    for (var li=0; li<sel.length; li++){
        var L = sel[li];
        var parade = L.property("ADBE Effect Parade");
        if (!parade) continue;

        for (var ei=1; ei<=parade.numProperties; ei++){
            var eff = parade.property(ei);
            if (!isPuppet(eff)) continue;

            var pins = collectPinPositions(eff);
            for (var k=0; k<pins.length; k++){
                var info = pins[k];

                // ピンのレイヤー座標 → コンポ座標
                var v  = info.posProp.valueAtTime(t,false);     // [x,y]（TwoD_SPATIAL）
                var cp = L.sourcePointToComp([v[0], v[1]]);

                var nullName = makeNullName(L, info.meshName, info.pinName);
                var existed  = !!comp.layer(nullName);
                var got      = getOrCreateNull(comp, L, nullName, cp);
                if (existed) REUSED++; else MADE++;

                // ピン位置へ式を設定（そのヌルを参照）
                var expr =
                    'var ctrl = thisComp.layer("' + esc(nullName) + '");\n' +
                    'thisLayer.fromComp( ctrl.toComp(ctrl.anchorPoint) );\n';
                info.posProp.expression = expr;
                info.posProp.expressionEnabled = true;
                LINKED++;
            }
        }
    }

    alert("完了：新規 " + MADE + "、再利用 " + REUSED + "、リンク設定 " + LINKED + "。");
    app.endUndoGroup();
})();
