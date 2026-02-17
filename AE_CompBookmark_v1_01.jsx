﻿(function (thisObj) {
    var SCRIPT_NAME = "Favorite Footages Placer";
    var GLOBAL_KEY = "__AE_CompBookmark_v1_01_UI__";

    // ===============================
    // 設定保存用キー
    // ===============================
    var PREF_SECTION = "FavoriteFootagesPlacer";

        
    function getProjectKey() {
        if (!app.project) return "NO_PROJECT";

        var file = null;
        try {
            file = app.project.file;
        } catch (e) {
            file = null;
        }

        // まだ一度も保存していないプロジェクト
        if (!file) {
            return "idList_UNTITLED_PROJECT";
        }

        try {
            // プロジェクトファイルがあるフォルダ（パス）
            var folderPath = (file.parent) ? file.parent.fsName : "NO_FOLDER";

            // ファイルの作成日時（リネームしても変わらない想定）
            var createdStr = "";
            try {
                // File.created は Date オブジェクト
                if (file.created) {
                    createdStr = file.created.toString();
                }
            } catch (e2) {
                createdStr = "";
            }

            // フォルダパス＋作成日時 を組み合わせてキーを作る
            var keyStr = folderPath + "|" + createdStr;

            // 設定キーに使えない文字を置き換え
            keyStr = keyStr.replace(/[\\\/:*\?"<>|]/g, "_");

            return "idList_" + keyStr;
        } catch (e3) {
            // 何かあったら最後の保険
            return "idList_FALLBACK";
        }
    }


    function loadIdListFromSettings() {
        var key = getProjectKey();
        var ids = [];

        try {
            if (app.settings.haveSetting(PREF_SECTION, key)) {
                var s = app.settings.getSetting(PREF_SECTION, key);
                if (s && s.length > 0) {
                    var parts = s.split(",");
                    for (var i = 0; i < parts.length; i++) {
                        var p = parts[i];
                        if (p === "") continue;
                        var n = parseInt(p, 10);
                        if (!isNaN(n)) ids.push(n);
                    }
                }
            }
        } catch (e) {
            // 読み込み失敗時は空リスト
        }

        return ids;
    }

    function saveIdListToSettings(idList) {
        var key = getProjectKey();
        try {
            var s = "";
            if (idList && idList.length > 0) {
                var tmp = [];
                for (var i = 0; i < idList.length; i++) {
                    tmp.push(String(idList[i]));
                }
                s = tmp.join(",");
            }
            app.settings.saveSetting(PREF_SECTION, key, s);
        } catch (e) {
            // 保存失敗は無視（動作自体には影響なし）
        }
    }

    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

        if (!pal) return pal;

        // -----------------------------
        // データ保持用
        // -----------------------------
        var idList = loadIdListFromSettings();   // 設定から読み込んだ ProjectItem.id の配列
        var registeredItems = [];                // {item, id, name, type}
        var registeredIdMap = {};                // id: true

        // -----------------------------
        // UI 構築
        // -----------------------------
        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.margins = 10;
        pal.spacing = 8;

        // 上部ボタン群
        var gTop = pal.add("group");
        gTop.orientation = "row";
        gTop.alignChildren = ["fill", "center"];
        gTop.spacing = 5;

        var btnRegister = gTop.add("button", undefined, "選択を登録");
        var btnRemove = gTop.add("button", undefined, "登録を削除");
        var btnClear = gTop.add("button", undefined, "登録を全削除");

        // 一覧（リスト）
        var listBox = pal.add(
            "listbox",
            undefined,
            "",
            {
                multiselect: false,
                numberOfColumns: 2,
                showHeaders: true,
                columnTitles: ["名前", "種類"],
                columnWidths: [260, 80]
            }
        );
        listBox.preferredSize = [360, 200];

        // 下部ボタン群（上段：差し替え＆ジャンプ）
        var gBottomTop = pal.add("group");
        gBottomTop.orientation = "row";
        gBottomTop.alignChildren = ["fill", "center"];
        gBottomTop.spacing = 5;

        var btnReplaceLayer = gBottomTop.add("button", undefined, "レイヤーの差し替え");
        var btnJumpToLayer = gBottomTop.add("button", undefined, "レイヤーにジャンプ");

        // 下部ボタン群（下段：配置＆選択を開く）
        var gBottom = pal.add("group");
        gBottom.orientation = "row";
        gBottom.alignChildren = ["fill", "center"];
        gBottom.spacing = 5;

        var btnUse = gBottom.add("button", undefined, "アクティブコンポに配置");
        var btnOpenSelected = null;
        if (pal instanceof Window) {
            // ★「閉じる」→「選択を開く」に変更
            btnOpenSelected = gBottom.add("button", undefined, "選択を開く");
        }

        // -----------------------------
        // ヘルパー関数
        // -----------------------------
        function getItemTypeString(it) {
            if (it instanceof CompItem) return "コンポ";
            if (it instanceof FootageItem) return "フッテージ";
            return "その他";
        }

        function findProjectItemById(id) {
            if (!app.project) return null;
            var proj = app.project;
            for (var i = 1; i <= proj.numItems; i++) {
                var it = proj.item(i);
                try {
                    if (it.id === id) return it;
                } catch (e) {
                    // 取得不可ならスルー
                }
            }
            return null;
        }

        // ★ 登録アイテムがまだ有効かどうかチェック
        function isRegisteredItemValid(projItem) {
            if (!projItem) return false;
            try {
                // ここで ReferenceError: オブジェクトが無効 になるかどうかを見る
                var _n = projItem.name;
            } catch (e) {
                return false;
            }
            return true;
        }

        function refreshListBox() {
            listBox.removeAll();
            for (var i = 0; i < registeredItems.length; i++) {
                var data = registeredItems[i];
                if (!data || !data.item) continue;

                var li = listBox.add("item", data.name);
                li.subItems[0].text = data.type;
                li._itemId = data.id;
                li._itemRef = data.item;
            }
        }

        // 設定から読み込んだ idList をもとに、実際の ProjectItem を復元
        function rebuildFromIdList() {
            registeredItems = [];
            registeredIdMap = {};

            if (!app.project) {
                refreshListBox();
                return;
            }

            var newIdList = [];

            for (var i = 0; i < idList.length; i++) {
                var id = idList[i];
                var it = findProjectItemById(id);
                if (!it) {
                    // プロジェクトから削除されていたらスキップ
                    continue;
                }

                var info = {
                    item: it,
                    id: id,
                    name: it.name,
                    type: getItemTypeString(it)
                };
                registeredItems.push(info);
                registeredIdMap[id] = true;
                newIdList.push(id);
            }

            // 失効した ID を掃除して保存し直す
            idList = newIdList;
            saveIdListToSettings(idList);

            refreshListBox();
        }

        function addSelectionFromProject() {
            if (!app.project) {
                alert("プロジェクトが開かれていません。", SCRIPT_NAME);
                return;
            }

            var sel = app.project.selection;
            if (!sel || sel.length === 0) {
                alert("プロジェクトパネルでコンポまたはフッテージを選択してください。", SCRIPT_NAME);
                return;
            }

            var addedCount = 0;

            for (var i = 0; i < sel.length; i++) {
                var it = sel[i];

                if (!(it instanceof CompItem) && !(it instanceof FootageItem)) {
                    // 必要に応じてフォルダ等を弾く
                    continue;
                }

                var id;
                try {
                    id = it.id;
                } catch (e) {
                    continue;
                }

                if (registeredIdMap[id]) {
                    // すでに登録済み
                    continue;
                }

                registeredItems.push({
                    item: it,
                    id: id,
                    name: it.name,
                    type: getItemTypeString(it)
                });
                registeredIdMap[id] = true;
                idList.push(id);
                addedCount++;
            }

            if (addedCount === 0) {
                alert("追加できるコンポ／フッテージがありませんでした。", SCRIPT_NAME);
            }

            saveIdListToSettings(idList);
            refreshListBox();
        }

        function removeSelectedFromList() {
            var selItem = listBox.selection;
            if (!selItem) {
                alert("一覧から削除するアイテムを選択してください。", SCRIPT_NAME);
                return;
            }

            var targetId = selItem._itemId;
            if (targetId === undefined) return;

            // registeredItems から削除
            for (var i = 0; i < registeredItems.length; i++) {
                if (registeredItems[i].id === targetId) {
                    registeredItems.splice(i, 1);
                    break;
                }
            }
            // idMap からも削除
            if (registeredIdMap[targetId]) {
                delete registeredIdMap[targetId];
            }
            // idList からも削除
            for (var j = 0; j < idList.length; j++) {
                if (idList[j] === targetId) {
                    idList.splice(j, 1);
                    break;
                }
            }

            saveIdListToSettings(idList);
            refreshListBox();
        }

        function clearAll() {
            if (registeredItems.length === 0) return;
            if (!confirm("一覧を全てクリアしてもよろしいですか？")) return;

            registeredItems = [];
            registeredIdMap = {};
            idList = [];

            saveIdListToSettings(idList);
            refreshListBox();
        }

        function placeSelectedToActiveComp() {
            if (!app.project) {
                alert("プロジェクトが開かれていません。", SCRIPT_NAME);
                return;
            }

            var activeComp = app.project.activeItem;
            if (!(activeComp instanceof CompItem)) {
                alert("アクティブアイテムがコンポジションではありません。\n配置したいコンポをアクティブにしてください。", SCRIPT_NAME);
                return;
            }

            var selItem = listBox.selection;
            if (!selItem) {
                alert("一覧から配置したいアイテムを選択してください。", SCRIPT_NAME);
                return;
            }

            var projItem = selItem._itemRef;
            if (!isRegisteredItemValid(projItem)) {
                alert("この登録アイテムはすでにプロジェクトから削除されている可能性があります。", SCRIPT_NAME);
                return;
            }

            app.beginUndoGroup(SCRIPT_NAME + " - 追加");

            try {
                var newLayer = activeComp.layers.add(projItem);
                // newLayer.property("Position").setValue([activeComp.width/2, activeComp.height/2]);
            } catch (e2) {
                alert("レイヤーの追加に失敗しました:\n" + e2.toString(), SCRIPT_NAME);
            } finally {
                app.endUndoGroup();
            }
        }

        // 登録アイテムでアクティブコンポの選択レイヤーを差し替え（複数レイヤー対応）
        function replaceSelectedLayerWithRegistered() {
            if (!app.project) {
                alert("プロジェクトが開かれていません。", SCRIPT_NAME);
                return;
            }

            var activeComp = app.project.activeItem;
            if (!(activeComp instanceof CompItem)) {
                alert("アクティブアイテムがコンポジションではありません。\n差し替えたいコンポをアクティブにしてください。", SCRIPT_NAME);
                return;
            }

            var selItem = listBox.selection;
            if (!selItem) {
                alert("一覧から差し替えに使用するアイテムを選択してください。", SCRIPT_NAME);
                return;
            }

            var projItem = selItem._itemRef;
            if (!isRegisteredItemValid(projItem)) {
                // ★「レイヤーの差し替え」と同じポップアップ
                alert("この登録アイテムはすでにプロジェクトから削除されている可能性があります。", SCRIPT_NAME);
                return;
            }

            var selLayers = activeComp.selectedLayers;
            if (!selLayers || selLayers.length === 0) {
                alert("アクティブコンポ内で、差し替えたいレイヤーを選択してください。", SCRIPT_NAME);
                return;
            }

            app.beginUndoGroup(SCRIPT_NAME + " - レイヤー差し替え");
            try {
                // 選択されているすべてのレイヤーを一括で差し替え
                for (var i = 0; i < selLayers.length; i++) {
                    var targetLayer = selLayers[i];
                    try {
                        targetLayer.replaceSource(projItem, false);
                    } catch (e2) {
                        alert("レイヤー「" + targetLayer.name + "」の差し替えに失敗しました:\n" + e2.toString(), SCRIPT_NAME);
                    }
                }
            } finally {
                app.endUndoGroup();
            }
        }

        // プロジェクトパネルで登録アイテムにジャンプ
        // → ジャンプしたアイテム「だけ」が選択状態になる
        function jumpToRegisteredItemInProject() {
            if (!app.project) {
                alert("プロジェクトが開かれていません。", SCRIPT_NAME);
                return;
            }

            var selItem = listBox.selection;
            if (!selItem) {
                alert("一覧からジャンプしたいアイテムを選択してください。", SCRIPT_NAME);
                return;
            }

            var projItem = selItem._itemRef;
            if (!isRegisteredItemValid(projItem)) {
                // ★ エラー文を「レイヤーの差し替え」と統一
                alert("この登録アイテムはすでにプロジェクトから削除されている可能性があります。", SCRIPT_NAME);
                return;
            }

            app.beginUndoGroup(SCRIPT_NAME + " - レイヤーにジャンプ");
            try {
                // いま選択されているアイテムだけを取得
                var currentSel = app.project.selection;
                // そのアイテムたちだけ選択解除
                for (var i = 0; i < currentSel.length; i++) {
                    try {
                        currentSel[i].selected = false;
                    } catch (e2) {}
                }

                // ジャンプ対象だけを選択状態に
                projItem.selected = true;
            } catch (e) {
                // ★ ここでも同じメッセージに統一
                alert("この登録アイテムはすでにプロジェクトから削除されている可能性があります。", SCRIPT_NAME);
            } finally {
                app.endUndoGroup();
            }
        }

        // ★ ダブルクリック & 「選択を開く」共通処理
        //    1) 有効チェック → NGなら統一ポップアップ
        //    2) 「レイヤーにジャンプ」挙動
        //    3) Comp / Footage をビューワーで開く
        function openSelectedRegisteredItem() {
            var selItem = listBox.selection;
            if (!selItem) {
                alert("一覧から開きたいアイテムを選択してください。", SCRIPT_NAME);
                return;
            }

            var projItem = selItem._itemRef;
            if (!isRegisteredItemValid(projItem)) {
                // ★ ここも統一
                alert("この登録アイテムはすでにプロジェクトから削除されている可能性があります。", SCRIPT_NAME);
                return;
            }

            // 先にプロジェクトパネル上でジャンプ＆単独選択
            jumpToRegisteredItemInProject();

            try {
                if (projItem instanceof CompItem || projItem instanceof FootageItem) {
                    projItem.openInViewer();
                } else {
                    alert("このアイテムは開くことができません。", SCRIPT_NAME);
                }
            } catch (e) {
                alert("アイテムを開けませんでした:\n" + e.toString(), SCRIPT_NAME);
            }
        }

        // -----------------------------
        // イベント割り当て
        // -----------------------------
        btnRegister.onClick = function () {
            app.beginUndoGroup(SCRIPT_NAME + " - 登録");
            try {
                addSelectionFromProject();
            } finally {
                app.endUndoGroup();
            }
        };

        btnRemove.onClick = function () {
            app.beginUndoGroup(SCRIPT_NAME + " - 削除");
            try {
                removeSelectedFromList();
            } finally {
                app.endUndoGroup();
            }
        };

        btnClear.onClick = function () {
            app.beginUndoGroup(SCRIPT_NAME + " - 全削除");
            try {
                clearAll();
            } finally {
                app.endUndoGroup();
            }
        };

        btnReplaceLayer.onClick = function () {
            replaceSelectedLayerWithRegistered();
        };

        btnJumpToLayer.onClick = function () {
            jumpToRegisteredItemInProject();
        };

        btnUse.onClick = function () {
            placeSelectedToActiveComp();
        };

        // ★ 新しい「選択を開く」ボタン
        if (btnOpenSelected) {
            btnOpenSelected.onClick = function () {
                openSelectedRegisteredItem();
            };
        }

        // ★ ダブルクリックで「レイヤーにジャンプ」＋ビューワーを開く
        listBox.onDoubleClick = function () {
            openSelectedRegisteredItem();
        };

        // リサイズ対応
        pal.onResizing = pal.onResize = function () {
            this.layout.resize();
        };

        // 設定から復元してリスト表示
        rebuildFromIdList();

        pal.layout.layout(true);
        return pal;
    }

    if (!(thisObj instanceof Panel)) {
        if (!($.global[GLOBAL_KEY] === undefined || $.global[GLOBAL_KEY] === null)) {
            try {
                $.global[GLOBAL_KEY].show();
                $.global[GLOBAL_KEY].active = true;
            } catch (_reuseErr) {}
            return;
        }
    }

    var myPal = buildUI(thisObj);

    if (myPal && myPal instanceof Window) {
        $.global[GLOBAL_KEY] = myPal;
        myPal.onClose = function () {
            try { $.global[GLOBAL_KEY] = null; } catch (_closeErr) {}
        };
        myPal.center();
        myPal.show();
    }
})(this);
