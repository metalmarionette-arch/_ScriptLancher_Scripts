/*  Duplicate Layer Name Renamer.jsx
    同名レイヤーがある場合に、末尾へナンバリングして一意化します。

    使い方：
    1) 対象コンポをアクティブにする
    2) （任意）対象を選択してから実行（選択があれば選択のみ、なければ全レイヤー）
*/

(function () {
    // ===== 設定ここから =====
    var DELIMITER = "_";          // 例: "_" → Outline_02, " " → Outline 02
    var MIN_DIGITS = 2;           // 2 → 01,02 / 3 → 001,002
    var KEEP_FIRST_AS_IS = true;  // true: 最初の1枚は元名のまま、2枚目以降に番号
                                 // false: 重複グループは全て番号（Outline_01, Outline_02...）
    // ===== 設定ここまで =====

    function padNumber(n, digits) {
        var s = String(n);
        while (s.length < digits) s = "0" + s;
        return s;
    }

    function isCompActive(item) {
        return item && (item instanceof CompItem);
    }

    var comp = app.project.activeItem;
    if (!isCompActive(comp)) {
        alert("アクティブなコンポジションを開いてから実行してください。");
        return;
    }

    app.beginUndoGroup("Unique Layer Names (Numbering)");

    // 対象レイヤー：選択があれば選択、なければ全て
    var targets = [];
    if (comp.selectedLayers && comp.selectedLayers.length > 0) {
        for (var i = 0; i < comp.selectedLayers.length; i++) targets.push(comp.selectedLayers[i]);
    } else {
        for (var li = 1; li <= comp.numLayers; li++) targets.push(comp.layer(li));
    }

    // コンポ全体の既存名セット（選択以外も含めて衝突回避）
    var usedNames = {};
    for (var all = 1; all <= comp.numLayers; all++) {
        usedNames[comp.layer(all).name] = true;
    }

    // 名前 → レイヤー配列（ターゲット内での重複を調べる）
    var groups = {};
    for (var t = 0; t < targets.length; t++) {
        var nm = targets[t].name;
        if (!groups[nm]) groups[nm] = [];
        groups[nm].push(targets[t]);
    }

    // レイヤーindex順に整列
    function sortByIndex(a, b) { return a.index - b.index; }

    var renamedCount = 0;
    for (var name in groups) {
        if (!groups.hasOwnProperty(name)) continue;

        var arr = groups[name];
        if (arr.length <= 1) continue; // 重複なしはスキップ

        arr.sort(sortByIndex);

        // 付番桁数：最低 MIN_DIGITS、必要なら増やす（例: 120枚なら3桁）
        var digits = Math.max(MIN_DIGITS, String(arr.length).length);

        for (var k = 0; k < arr.length; k++) {
            if (KEEP_FIRST_AS_IS && k === 0) continue;

            // 付番（KEEP_FIRST_AS_IS=true なら 2,3,4... / false なら 1,2,3...）
            var seq = KEEP_FIRST_AS_IS ? (k + 1) : (k + 1);

            // 衝突しない名前が見つかるまで seq を増やす
            var candidate = "";
            while (true) {
                candidate = name + DELIMITER + padNumber(seq, digits);
                if (!usedNames[candidate]) break;
                seq++;
            }

            try {
                // 予約（衝突回避）
                usedNames[candidate] = true;
                // リネーム
                arr[k].name = candidate;
                renamedCount++;
            } catch (e) {
                // 失敗しても続行
            }
        }
    }

    app.endUndoGroup();

    alert("完了：リネーム " + renamedCount + " 件");
})();
