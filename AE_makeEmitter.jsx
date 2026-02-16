// AE_makeEmitter_v1_00.jsx  （差し替え版：3D＋ガイド有効）
#target aftereffects
(function () {
  function pad2(n){ return (n<10)?("0"+n):String(n); }
  function getNextEmitterName() {
    var proj = app.project, maxIdx = -1, re = /^エミッター_(\d+)$/;
    for (var i=1; i<=proj.numItems; i++){
      var it = proj.item(i);
      if (it instanceof CompItem){
        var m = re.exec(it.name);
        if (m){
          var num = parseInt(m[1],10);
          if (!isNaN(num) && num > maxIdx) maxIdx = num;
        }
      }
    }
    return "エミッター_" + pad2(maxIdx + 1);
  }

  function createEmitterComp(fps){
    var name = getNextEmitterName(),
        w=1000, h=1000, par=1.0, frames=1000, duration=frames/fps;

    var comp = app.project.items.addComp(name, w, h, par, duration, fps);

    // シェイプレイヤー：円（700）、塗り無し、線幅250
    var shapeLayer = comp.layers.addShape();
    shapeLayer.name = "エミッター円";
    var contentsRoot = shapeLayer.property("ADBE Root Vectors Group");
    var group = contentsRoot.addProperty("ADBE Vector Group"); group.name = "円グループ";
    var groupContents = group.property("ADBE Vectors Group");

    var ellipse = groupContents.addProperty("ADBE Vector Shape - Ellipse");
    ellipse.property("ADBE Vector Ellipse Size").setValue([700,700]);

    var stroke = groupContents.addProperty("ADBE Vector Graphic - Stroke");
    stroke.property("ADBE Vector Stroke Width").setValue(250);

    // 念のため既存Fillがあれば除去
    for (var i=groupContents.numProperties; i>=1; i--){
      var p = groupContents.property(i);
      if (p && p.matchName === "ADBE Vector Graphic - Fill"){ p.remove(); }
    }
    return comp;
  }

  if (!app.project){ app.newProject(); }
  var activeComp = app.project.activeItem;
  if (!(activeComp && activeComp instanceof CompItem)){
    alert("アクティブなコンポがありません。\nタイムラインをクリックしてコンポをアクティブにしてから実行してください。");
    return;
  }

  app.beginUndoGroup("エミッター作成(即実行)");
  try {
    var fps = (activeComp.frameRate && !isNaN(activeComp.frameRate) && activeComp.frameRate>0) ? activeComp.frameRate : 30;
    var emitterComp = createEmitterComp(fps);

    // アクティブコンポに配置 → 3D化 → ガイドレイヤー化
    var emitterLayer = activeComp.layers.add(emitterComp);
    emitterLayer.startTime   = 0;
    emitterLayer.threeDLayer = true;  // 3DスイッチON
    emitterLayer.guideLayer  = true;  // ガイドレイヤーON（最終レンダーに出さない）

    // （必要なら）プリコンプのコラップス変換もONにできます：
    // emitterLayer.collapseTransformation = true;

    alert("作成＆配置しました: " + emitterComp.name + "（3D・ガイドON） → 「" + activeComp.name + "」");
  } catch(e){
    alert("エミッター作成中にエラー:\n" + e.toString());
  } finally {
    app.endUndoGroup();
  }
})();
