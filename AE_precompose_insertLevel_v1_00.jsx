// AE_precompose_insertLevel_v1_00.jsx
// 目的:
//  1) アクティブコンポ名を Base_20 のように解釈（末尾の数字を採番）
//  2) Base_30, Base_40... が存在すれば高い方から +10 で順次リネーム（40→50, 30→40）
//  3) アクティブコンポ Base_20 を Base_30 にリネーム
//  4) 選択レイヤーをプリコンし、その新規コンポ名を "Base_20"（元の名前）にして挟み込む
//
// 使い方:
//  ・配置先のコンポをアクティブにし、プリコン化したいレイヤーを選択して実行。
// 注意:
//  ・アクティブコンポ名が「(任意)_数字」の形式でない場合は中断。
//  ・末尾数字の桁数はそのまま維持（例: 00 → 2桁維持）。
//  ・同名コンポが他に存在しても AE 的には許容（必要に応じて一意化ロジックを追加可能）。
//
#target aftereffects

(function () {
  var STEP = 10;

  // ===== Utils =====
  function parseBaseAndNumber(name) {
    // 末尾 "_<digits>" を抽出（例: "Comp_20" -> base="Comp", numStr="20", num=20, width=2）
    var m = /^(.*)_(\d+)$/.exec(name);
    if (!m) return null;
    var base = m[1];
    var numStr = m[2];
    var num = parseInt(numStr, 10);
    if (isNaN(num)) return null;
    return { base: base, num: num, width: numStr.length };
  }

  function padNumber(n, width) {
    var s = String(Math.max(0, n));
    while (s.length < width) s = "0" + s;
    return s;
  }

  function collectFollowingComps(proj, base, startNum, step) {
    // base_ (startNum以上) かつ (n - startNum) が stepの倍数 のものを収集
    var arr = [];
    var re = new RegExp("^" + escapeRegExp(base) + "_(\\d+)$");
    for (var i = 1; i <= proj.numItems; i++) {
      var it = proj.item(i);
      if (it instanceof CompItem) {
        var m = re.exec(it.name);
        if (m) {
          var n = parseInt(m[1], 10);
          if (!isNaN(n) && n >= startNum && ((n - startNum) % step === 0)) {
            arr.push({ comp: it, num: n, width: m[1].length });
          }
        }
      }
    }
    return arr;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // ===== Main =====
  if (!app.project) { app.newProject(); }
  var activeComp = app.project.activeItem;
  if (!(activeComp && activeComp instanceof CompItem)) {
    alert("アクティブなコンポがありません。タイムラインでコンポをアクティブにしてから実行してください。");
    return;
  }
  if (!activeComp.selectedLayers || activeComp.selectedLayers.length === 0) {
    alert("プリコン化するレイヤーを選択してください。");
    return;
  }

  var info = parseBaseAndNumber(activeComp.name);
  if (!info) {
    alert("アクティブコンポ名は『名前_数字』形式である必要があります（例: MyComp_20）。");
    return;
  }
  var base = info.base;
  var curNum = info.num;
  var width = info.width;

  var nextNum = curNum + STEP;

  app.beginUndoGroup("プリコン挿入＆連番シフト");
  try {
    // 1) 後続（_30, _40...）を収集して降順で +10 リネーム
    var list = collectFollowingComps(app.project, base, nextNum, STEP);
    // 幅は各アイテムの元桁数を維持。ただし通常は同じ幅（例: "00","10","20"...）
    list.sort(function (a, b) { return b.num - a.num; });
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var newName = base + "_" + padNumber(it.num + STEP, it.width);
      it.comp.name = newName;
    }

    // 2) アクティブコンポを _cur → _cur+10 にリネーム（元名をプリコン用に空ける）
    var oldName = activeComp.name;                      // 例: "Base_20"
    var newActiveName = base + "_" + padNumber(nextNum, width); // 例: "Base_30"
    activeComp.name = newActiveName;

    // 3) プリコン（新規コンポ名は“元の名前”= oldName）
    var sel = activeComp.selectedLayers; // 既にリネーム済みだが中身は同じコンポ
    var indices = [];
    for (var j = 0; j < sel.length; j++) indices.push(sel[j].index);

    var moveAllAttributes = true; // 必要に応じて false に変更
    var precomp = activeComp.layers.precompose(indices, oldName, moveAllAttributes);

    // ログ（静かにしたい場合はコメントアウト可）
    $.writeln("[insertLevel] Renamed: " + newActiveName + " / Created Precomp: " + oldName);

  } catch (e) {
    alert("処理中にエラー:\n" + e.toString());
  } finally {
    app.endUndoGroup();
  }
})();
