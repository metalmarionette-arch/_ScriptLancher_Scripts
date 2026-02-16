// AE_makeEmitterRect_v1_00.jsx
// アクティブコンポのサイズで「エミッター_**」コンポを作成し、
// その中にコンポサイズの長方形（塗りなし・線幅250）を作る。
// 実行時のアクティブコンポにレイヤーとして配置し、ガイドレイヤーをONにする。

#target aftereffects

(function () {
  function pad2(n){ return (n<10)?("0"+n):String(n); }

  // 既存の「エミッター_**」から次番号を採番
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

  // 長方形エミッターコンポを作成（サイズ＝引数のw/h、尺＝1000f）
  function createRectEmitterComp(w, h, par, fps) {
    var frames = 1000;
    var duration = frames / fps;
    var name = getNextEmitterName();
    var comp = app.project.items.addComp(name, w, h, par, duration, fps);

    // --- シェイプレイヤー：コンポサイズの長方形 ---
    var shapeLayer = comp.layers.addShape();
    shapeLayer.name = "エミッター長方形";

    var root = shapeLayer.property("ADBE Root Vectors Group");
    var grp  = root.addProperty("ADBE Vector Group");
    grp.name = "長方形グループ";

    var g = grp.property("ADBE Vectors Group");

    // 長方形パス（サイズ＝コンポサイズ、角丸0）
    var rect = g.addProperty("ADBE Vector Shape - Rect");
    rect.property("ADBE Vector Rect Size").setValue([w, h]);
    rect.property("ADBE Vector Rect Roundness").setValue(0);

    // ストローク（線幅250）
    var stroke = g.addProperty("ADBE Vector Graphic - Stroke");
    stroke.property("ADBE Vector Stroke Width").setValue(250);

    // 念のため塗りがあれば削除（この順だと通常は存在しないが保険）
    for (var i=g.numProperties; i>=1; i--){
      var p = g.property(i);
      if (p && p.matchName === "ADBE Vector Graphic - Fill") { p.remove(); }
    }

    return comp;
  }

  // -------- メイン --------
  if (!app.project) { app.newProject(); }
  var activeComp = app.project.activeItem;
  if (!(activeComp && activeComp instanceof CompItem)) {
    alert("アクティブなコンポがありません。\nタイムラインで配置先のコンポをアクティブにしてから実行してください。");
    return;
  }

  app.beginUndoGroup("長方形エミッター作成");
  try {
    var w   = activeComp.width;
    var h   = activeComp.height;
    var par = activeComp.pixelAspect;
    var fps = (activeComp.frameRate && activeComp.frameRate > 0) ? activeComp.frameRate : 30;

    var emitterComp  = createRectEmitterComp(w, h, par, fps);

    // アクティブコンポに配置 → ガイドレイヤーON
    var emitterLayer = activeComp.layers.add(emitterComp);
    emitterLayer.startTime  = 0;
    emitterLayer.guideLayer = true;      // ガイドON（レンダーに出さない）
    emitterLayer.threeDLayer = true;  // ← 3Dも必要ならこの行を有効化

    // 成功通知（静かにしたい場合はこの行をコメントアウト）
    alert("作成＆配置しました: " + emitterComp.name + "（長方形・ガイドON） → 「" + activeComp.name + "」");
  } catch (e) {
    alert("作成中にエラー:\n" + e.toString());
  } finally {
    app.endUndoGroup();
  }
})();
