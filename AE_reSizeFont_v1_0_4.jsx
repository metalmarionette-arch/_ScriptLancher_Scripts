/**
 * Font Size by Character Type (AE 24.3+)
 * - 漢字 / 英大 / 英小 / ひら / カタ / 句読点 を選択して、フォントサイズを倍率変更
 * - スケール(%) 入力 + スライダー
 * - 実行ボタンで、選択テキストレイヤーに適用
 *
 * 使い方：
 * 1) テキストレイヤーを選択
 * 2) 対象の文字種にチェック
 * 3) スケール(%) を設定（例：120 = 1.2倍）
 * 4) 実行
 *
 * 設置：
 * - ドック可能にするなら：
 *   (Windows) C:\Program Files\Adobe\Adobe After Effects XXXX\Support Files\Scripts\ScriptUI Panels\
 *   (Mac) /Applications/Adobe After Effects XXXX/Scripts/ScriptUI Panels/
 * - 再起動後「ウィンドウ」メニューに出ます
 */

(function FontSizeByCharType(thisObj) {
    var SCRIPT_NAME = "CharType FontSize";

    function clamp(v, mn, mx) {
        return Math.max(mn, Math.min(mx, v));
    }

    function isKanji(code) {
        // CJK Unified + Ext A + Compatibility (ざっくり広め)
        return (code >= 0x4E00 && code <= 0x9FFF) ||
               (code >= 0x3400 && code <= 0x4DBF) ||
               (code >= 0xF900 && code <= 0xFAFF);
    }

    function isHiragana(code) {
        return (code >= 0x3040 && code <= 0x309F);
    }

    function isKatakana(code) {
        return (code >= 0x30A0 && code <= 0x30FF) || (code >= 0x31F0 && code <= 0x31FF);
    }

    function isUpperLatin(ch, code) {
        // ASCII + Fullwidth
        return ((ch >= "A" && ch <= "Z") || (code >= 0xFF21 && code <= 0xFF3A));
    }

    function isLowerLatin(ch, code) {
        // ASCII + Fullwidth
        return ((ch >= "a" && ch <= "z") || (code >= 0xFF41 && code <= 0xFF5A));
    }

    function isPunctuation(ch, code) {
        // 空白は除外
        if (ch === " " || ch === "\t" || ch === "　") return false;

        // ASCII記号
        if ((code >= 0x21 && code <= 0x2F) ||
            (code >= 0x3A && code <= 0x40) ||
            (code >= 0x5B && code <= 0x60) ||
            (code >= 0x7B && code <= 0x7E)) return true;

        // 一般句読点/記号ブロック(ざっくり)
        if ((code >= 0x2000 && code <= 0x206F) || // General Punctuation
            (code >= 0x3000 && code <= 0x303F) || // CJK Symbols and Punctuation
            (code >= 0xFF00 && code <= 0xFF0F) || // Fullwidth forms(一部)
            (code >= 0xFF1A && code <= 0xFF20) ||
            (code >= 0xFF3B && code <= 0xFF40) ||
            (code >= 0xFF5B && code <= 0xFF65)) return true;

        // よく使う日本語記号を追加
        var extra = "、。・「」『』（）［］【】〈〉《》〔〕？！…：；ー〜";
        return (extra.indexOf(ch) !== -1);
    }

    function matchType(ch, opts) {
        var code = ch.charCodeAt(0);

        // 改行は対象外
        if (ch === "\r" || ch === "\n") return false;

        var m = false;
        if (opts.punct && isPunctuation(ch, code)) m = true;
        if (opts.kanji && isKanji(code)) m = true;
        if (opts.hira && isHiragana(code)) m = true;
        if (opts.kata && isKatakana(code)) m = true;
        if (opts.upper && isUpperLatin(ch, code)) m = true;
        if (opts.lower && isLowerLatin(ch, code)) m = true;

        return m;
    }

    function applyScaleToTextDocument(textDocument, factor, opts) {
        if (!textDocument || typeof textDocument.characterRange !== "function") {
            return false;
        }

        var s = textDocument.text;
        if (s === undefined || s === null) s = "";

        for (var i = 0; i < s.length; i++) {
            var ch = s.charAt(i);
            if (!matchType(ch, opts)) continue;

            try {
                // 1文字レンジで混在回避
                var cr = textDocument.characterRange(i, i + 1);
                var fs = cr.fontSize;
                if (fs !== undefined && !isNaN(fs)) {
                    var newFs = fs * factor;
                    // AEの範囲に寄せつつ下限を確保
                    newFs = clamp(newFs, 0.1, 1296);
                    cr.fontSize = newFs;
                }
            } catch (e) {
                // 範囲が無効などはスキップ
            }
        }
        return true;
    }

    function applyAbsoluteToTextDocument(textDocument, absSize, opts) {
        if (!textDocument || typeof textDocument.characterRange !== "function") {
            return false;
        }

        var s = textDocument.text;
        if (s === undefined || s === null) s = "";

        for (var i = 0; i < s.length; i++) {
            var ch = s.charAt(i);
            if (!matchType(ch, opts)) continue;

            try {
                var cr = textDocument.characterRange(i, i + 1);
                cr.fontSize = absSize;
            } catch (e) {
                // skip
            }
        }
        return true;
    }

    function getSelectedTextLayers(comp) {
        var arr = [];
        if (!comp || !(comp instanceof CompItem)) return arr;
        var sel = comp.selectedLayers;
        for (var i = 0; i < sel.length; i++) {
            var lyr = sel[i];
            if (lyr && lyr.property && lyr.property("Source Text") !== null) {
                arr.push(lyr);
            }
        }
        return arr;
    }

    function buildUI(thisObj) {
        var pal = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];

        // --- 対象文字種 ---
        var pTypes = pal.add("panel", undefined, "対象文字種");
        pTypes.orientation = "column";
        pTypes.alignChildren = ["left", "top"];

        var row1 = pTypes.add("group");
        row1.orientation = "row";
        row1.alignChildren = ["left", "center"];

        var cbKanji = row1.add("checkbox", undefined, "漢字");
        var cbUpper = row1.add("checkbox", undefined, "英文字(大文字)");
        var cbLower = row1.add("checkbox", undefined, "英文字(小文字)");

        var row2 = pTypes.add("group");
        row2.orientation = "row";
        row2.alignChildren = ["left", "center"];

        var cbHira  = row2.add("checkbox", undefined, "ひらがな");
        var cbKata  = row2.add("checkbox", undefined, "カタカナ");
        var cbPunct = row2.add("checkbox", undefined, "句読点/記号");

        // 初期：全部OFF
        cbKanji.value = false;
        cbUpper.value = false;
        cbLower.value = false;
        cbHira.value  = false;
        cbKata.value  = false;
        cbPunct.value = false;

        // --- モード ---
        var pMode = pal.add("panel", undefined, "モード");
        pMode.orientation = "row";
        pMode.alignChildren = ["left", "center"];

        var ddMode = pMode.add("dropdownlist", undefined, ["スケール(%)", "フォントサイズ指定"]);
        ddMode.selection = 0;

        // --- スケール ---
        var pScale = pal.add("panel", undefined, "スケール(%)");
        pScale.orientation = "column";
        pScale.alignChildren = ["fill", "top"];

        var gScale = pScale.add("group");
        gScale.orientation = "row";
        gScale.alignChildren = ["left", "center"];

        var st = gScale.add("statictext", undefined, "値:");
        st.preferredSize.width = 24;

        var etScale = gScale.add("edittext", undefined, "120");
        etScale.characters = 6;

        var st2 = gScale.add("statictext", undefined, "%");
        st2.preferredSize.width = 16;

        var sl = pScale.add("slider", undefined, 120, 10, 300);
        sl.preferredSize.height = 18;

        function syncFromSlider() {
            etScale.text = String(Math.round(sl.value));
        }
        function syncFromEdit() {
            var v = parseFloat(etScale.text);
            if (isNaN(v)) v = 100;
            v = clamp(v, 10, 300);
            etScale.text = String(Math.round(v));
            sl.value = v;
        }

        sl.onChanging = function () { syncFromSlider(); };
        etScale.onChange = function () { syncFromEdit(); };

        // --- フォントサイズ指定 ---
        var pAbs = pal.add("panel", undefined, "フォントサイズ指定");
        pAbs.orientation = "column";
        pAbs.alignChildren = ["fill", "top"];

        var gAbs = pAbs.add("group");
        gAbs.orientation = "row";
        gAbs.alignChildren = ["left", "center"];

        var stA = gAbs.add("statictext", undefined, "値:");
        stA.preferredSize.width = 24;

        var etAbs = gAbs.add("edittext", undefined, "100");
        etAbs.characters = 6;

        var stA2 = gAbs.add("statictext", undefined, "pt");
        stA2.preferredSize.width = 22;

        // スライダーは扱いやすい範囲に（手入力なら 1296pt まで可）
        var slAbs = pAbs.add("slider", undefined, 100, 1, 300);
        slAbs.preferredSize.height = 18;

        function syncAbsFromSlider() {
            etAbs.text = String(Math.round(slAbs.value));
        }
        function syncAbsFromEdit() {
            var v = parseFloat(etAbs.text);
            if (isNaN(v)) v = 12;
            v = clamp(v, 0.1, 1296);
            etAbs.text = String(v);
            slAbs.value = clamp(v, 1, 300);
        }

        slAbs.onChanging = function () { syncAbsFromSlider(); };
        etAbs.onChange = function () { syncAbsFromEdit(); };

        function updateModeEnabled() {
            var isScaleMode = (ddMode.selection && ddMode.selection.index === 0);
            pScale.enabled = isScaleMode;
            pAbs.enabled = !isScaleMode;
        }
        ddMode.onChange = function () { updateModeEnabled(); };
        updateModeEnabled();

        // --- 実行 ---
        var gExec = pal.add("group");
        gExec.orientation = "row";
        gExec.alignChildren = ["fill", "center"];

        var btn = gExec.add("button", undefined, "実行");
        btn.preferredSize.height = 28;

        btn.onClick = function () {
            var comp = app.project.activeItem;
            if (!comp || !(comp instanceof CompItem)) {
                alert("コンポをアクティブにしてください。");
                return;
            }

            var layers = getSelectedTextLayers(comp);
            if (layers.length === 0) {
                alert("テキストレイヤーを選択してください。");
                return;
            }

            var opts = {
                kanji: cbKanji.value,
                upper: cbUpper.value,
                lower: cbLower.value,
                hira:  cbHira.value,
                kata:  cbKata.value,
                punct: cbPunct.value
            };

            // 全部OFFなら何もしない
            if (!opts.kanji && !opts.upper && !opts.lower && !opts.hira && !opts.kata && !opts.punct) {
                alert("対象文字種を1つ以上チェックしてください。");
                return;
            }

            var isScaleMode = (ddMode.selection && ddMode.selection.index === 0);
            var factor = 1.0;
            var absSize = 0;

            if (isScaleMode) {
                var scalePct = parseFloat(etScale.text);
                if (isNaN(scalePct) || scalePct <= 0) {
                    alert("スケール(%)は正の数値にしてください。");
                    return;
                }
                factor = scalePct / 100.0;
            } else {
                var vAbs = parseFloat(etAbs.text);
                if (isNaN(vAbs) || vAbs <= 0) {
                    alert("フォントサイズは正の数値にしてください。");
                    return;
                }
                absSize = clamp(vAbs, 0.1, 1296);
            }

            app.beginUndoGroup(isScaleMode ? "CharType FontSize Scale" : "CharType FontSize Absolute");

            var needUpdate = false;
            for (var i = 0; i < layers.length; i++) {
                var lyr = layers[i];
                var textProp = lyr.property("Source Text");
                if (!textProp) continue;

                // AE 24.3+ かチェック
                var probe = textProp.value;
                if (!probe || typeof probe.characterRange !== "function") {
                    // 1回だけ注意
                    if (!needUpdate) {
                        alert("この機能は AE 24.3 以降が必要です（characterRangeが見つかりません）。");
                        needUpdate = true;
                    }
                    continue;
                }

                // キーフレームがある場合は全キーに適用（消さないため）
                if (textProp.numKeys && textProp.numKeys > 0) {
                    for (var k = 1; k <= textProp.numKeys; k++) {
                        var td = textProp.keyValue(k);
                        var ok = isScaleMode ? applyScaleToTextDocument(td, factor, opts) : applyAbsoluteToTextDocument(td, absSize, opts);
                        if (ok) {
                            try { textProp.setValueAtKey(k, td); } catch (e1) {}
                        }
                    }
                } else {
                    var td0 = textProp.value;
                    var ok0 = isScaleMode ? applyScaleToTextDocument(td0, factor, opts) : applyAbsoluteToTextDocument(td0, absSize, opts);
                    if (ok0) {
                        try { textProp.setValue(td0); } catch (e2) {}
                    }
                }
            }

            app.endUndoGroup();
            // 成功ポップアップは出しません（必要なら入れ替え可能）
        };

        // resize
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };

        return pal;
    }

    var pal = buildUI(thisObj);
    if (pal instanceof Window) {
        pal.center();
        pal.show();
    } else {
        pal.layout.layout(true);
    }

})(this);
