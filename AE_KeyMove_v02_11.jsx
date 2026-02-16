// AE_KeyOpeTool_v02_11.jsx (2025/07/16 修正)
// 修正点:
// 1. (BUG) KOT_roundKeyframePositions: 「キーのフレーム位置を整数に」機能でキーが消える問題を修正。
//    キー情報コピー時のプロパティ参照が間違っていたのを修正。
// 2. (BUG) KOT_regenerateKeys: タイムリマップの余剰キー削除処理がエラーの原因となっていたため、処理自体を削除。
//    ダミーキー方式の導入により、この処理は不要になったため。
// 3. (NEW) 「選択レイヤーの順番で追加」機能を追加。
//    移動またはスケール操作時に、選択したレイヤーの順番に応じてオフセット値を追加できるようにした。

// グローバルUI変数 (KOT_buildUI から返されるオブジェクトを格納)
var ui;

function cloneEase(e) {
    if (e instanceof Array) {
        var arr = [];
        for (var i = 0; i < e.length; i++) {
            if (e[i] && typeof e[i].speed !== 'undefined' && typeof e[i].influence !== 'undefined') {
                var influence = e[i].influence;
                if (influence < 0.1) influence = 0.1;
                arr.push(new KeyframeEase(e[i].speed, influence));
            } else {
                arr.push(new KeyframeEase(0, 0));
            }
        }
        return arr;
    } else {
        if (e && typeof e.speed !== 'undefined' && typeof e.influence !== 'undefined') {
            var influence = e.influence;
            if (influence < 0.1) influence = 0.1;
            return [new KeyframeEase(e.speed, influence)];
        } else {
            return [new KeyframeEase(0, 0)];
        }
    }
}


// ❶ UI 構築 --------------------------------------------------------------
function KOT_buildUI(thisObj) {
    var myPanel = (thisObj instanceof Panel) ? thisObj : new Window("palette", "キー操作ツール v2.11", undefined);
    myPanel.orientation = "column";
    myPanel.alignChildren = "left";

    // 移動基準 UI
    var originGroup = myPanel.add("panel", undefined, "移動基準");
    originGroup.orientation = "row";
    originGroup.alignment  = "left";
    var minMaxCheckbox    = originGroup.add("checkbox", undefined, "最小/最大");
    minMaxCheckbox.value  = true;
    var cursorCheckbox    = originGroup.add("checkbox", undefined, "カーソル");
    var numericCheckbox   = originGroup.add("checkbox", undefined, "数値");
    var numericValue      = originGroup.add("edittext",  undefined, "0");
    numericValue.characters = 8;
    // 【選択の値の取得】ボタン（中間値取得に変更）
    var getSelectedValueBtn    = originGroup.add("button", undefined, "←中間値の取得");
    // 【選択の中間フレーム取得】ボタン
    var getSelectedMidFrameBtn = originGroup.add("button", undefined, "中間フレーム取得");

    // 矢印ボタンと操作モード
    var mainControlGroup = myPanel.add("group");
    mainControlGroup.orientation = "row";
    mainControlGroup.alignChildren = ["center", "top"];

    var arrowGroup = mainControlGroup.add("group");
    arrowGroup.orientation = "column";
    arrowGroup.alignChildren = "center";
    var upBtn    = arrowGroup.add("button", undefined, "↑");  upBtn.size    = [40, 30];
    var midRow   = arrowGroup.add("group");                  midRow.orientation = "row";
    var leftBtn  = midRow.add("button", undefined, "←");      leftBtn.size  = [40, 30];
    var rightBtn = midRow.add("button", undefined, "→");      rightBtn.size = [40, 30];
    var downBtn  = arrowGroup.add("button", undefined, "↓");  downBtn.size  = [40, 30];

    var modeGroup = mainControlGroup.add("group");
    modeGroup.orientation = "column";
    modeGroup.alignChildren = "left";
    var moveModeGroup = modeGroup.add("group"); moveModeGroup.orientation = "row";
    var moveRadio    = moveModeGroup.add("radiobutton", undefined, "移動");
    var moveValueInput = moveModeGroup.add("edittext", undefined, "10"); moveValueInput.characters = 8;
    var scaleModeGroup = modeGroup.add("group"); scaleModeGroup.orientation = "row";
    var scaleRadio    = scaleModeGroup.add("radiobutton", undefined, "スケール");
    var scaleValueInput = scaleModeGroup.add("edittext", undefined, "1.2"); scaleValueInput.characters = 8;
    var absoluteRadio = modeGroup.add("radiobutton", undefined, "絶対揃え");
    var relativeRadio = modeGroup.add("radiobutton", undefined, "相対揃え");
    moveRadio.value    = true;

    // ▼▼▼▼▼ 新規追加UI ▼▼▼▼▼
    var layerOrderGroup = modeGroup.add("group");
    layerOrderGroup.orientation = "row";
    layerOrderGroup.alignChildren = "center";
    var layerOrderCheckbox = layerOrderGroup.add("checkbox", undefined, "選択レイヤーの順番で値を追加");
    var layerOrderValueInput = layerOrderGroup.add("edittext", undefined, "1");
    layerOrderValueInput.characters = 8;
    // ▲▲▲▲▲ 新規追加UIここまで ▲▲▲▲▲


    // イベント
    upBtn.onClick    = function () { KOT_executeUnifiedOperation("up");    };
    downBtn.onClick  = function () { KOT_executeUnifiedOperation("down"); };
    leftBtn.onClick  = function () { KOT_executeUnifiedOperation("left"); };
    rightBtn.onClick = function () { KOT_executeUnifiedOperation("right"); };

    // 【選択の値の取得】（最大と最小の中間値取得に変更）
    getSelectedValueBtn.onClick = function () {
        var midVal = KOT_getMidpointSelectedKeyValue();
        if (midVal !== null) {
            ui.numericValue.text = midVal.toFixed(2);
            ui.numericCheckbox.value = true;
            updateButtonStates();
        }
    };
    // 【選択の中間フレーム取得】
    getSelectedMidFrameBtn.onClick = function () {
        var midFrame = KOT_getMidpointSelectedKeyFrame();
        if (midFrame !== null) {
            ui.numericValue.text = midFrame.toFixed(2);
            ui.numericCheckbox.value = true;
            updateButtonStates();
        }
    };

    function createRadioGroup(radios) {
        for (var i = 0; i < radios.length; i++) {
            radios[i].onClick = function () {
                for (var j = 0; j < radios.length; j++) if (radios[j] !== this) radios[j].value = false;
                this.value = true;
                updateButtonStates();
            };
        }
    }
    createRadioGroup([moveRadio, scaleRadio, absoluteRadio, relativeRadio]);
    createRadioGroup([minMaxCheckbox, cursorCheckbox, numericCheckbox]);

    function updateButtonStates() {
        var upEnabled = false, downEnabled = false, leftEnabled = false, rightEnabled = false;
        if (moveRadio.value) {
            originGroup.enabled = false;
        } else {
            originGroup.enabled = true;
        }

        // ▼▼▼▼▼ 修正箇所 ▼▼▼▼▼
        // 「選択レイヤーの順番で追加」UIの有効/無効を切り替え
        var isMoveOrScale = moveRadio.value || scaleRadio.value;
        layerOrderGroup.enabled = isMoveOrScale;
        // ▲▲▲▲▲ 修正ここまで ▲▲▲▲▲

        if (moveRadio.value) {
            upEnabled = downEnabled = leftEnabled = rightEnabled = true;
        } else if (scaleRadio.value) {
            if (minMaxCheckbox.value) {
                upEnabled = downEnabled = leftEnabled = rightEnabled = true;
            } else if (cursorCheckbox.value) {
                rightEnabled = true;
            } else if (numericCheckbox.value) {
                upEnabled = rightEnabled = true;
            }
        } else if (absoluteRadio.value) {
            if (minMaxCheckbox.value) {
                upEnabled = downEnabled = leftEnabled = rightEnabled = true;
            } else if (cursorCheckbox.value) {
                rightEnabled = true;
            } else if (numericCheckbox.value) {
                upEnabled = rightEnabled = true;
            }
        } else if (relativeRadio.value) {
            if (minMaxCheckbox.value || numericCheckbox.value) {
                upEnabled = downEnabled = leftEnabled = rightEnabled = true;
            } else if (cursorCheckbox.value) {
                leftEnabled = rightEnabled = true;
            }
        }
        upBtn.enabled = upEnabled;
        downBtn.enabled = downEnabled;
        leftBtn.enabled = leftEnabled;
        rightBtn.enabled = rightEnabled;
        // ボタン有効状態
        getSelectedValueBtn.enabled    = numericCheckbox.value;
        getSelectedMidFrameBtn.enabled = numericCheckbox.value;
    }
    updateButtonStates();

    var roundKeyframeButton = myPanel.add("button", undefined, "選択キーのフレーム位置を整数に");
    roundKeyframeButton.onClick = function () { KOT_roundKeyframePositions(); };

    myPanel.layout.layout(true);
    myPanel.layout.resize();
    myPanel.onResizing = myPanel.onResize = function () { this.layout.resize(); };

    // ▼▼▼▼▼ 修正箇所（returnオブジェクトにUIを追加） ▼▼▼▼▼
    return {
        panel: myPanel, moveRadio: moveRadio, scaleRadio: scaleRadio,
        absoluteRadio: absoluteRadio, relativeRadio: relativeRadio,
        moveValueInput: moveValueInput, scaleValueInput: scaleValueInput,
        minMaxCheckbox: minMaxCheckbox, cursorCheckbox: cursorCheckbox,
        numericCheckbox: numericCheckbox, numericValue: numericValue,
        upBtn: upBtn, downBtn: downBtn, leftBtn: leftBtn, rightBtn: rightBtn,
        originGroup: originGroup,
        getSelectedValueBtn: getSelectedValueBtn,
        getSelectedMidFrameBtn: getSelectedMidFrameBtn,
        layerOrderCheckbox: layerOrderCheckbox,
        layerOrderValueInput: layerOrderValueInput
    };
    // ▲▲▲▲▲ 修正ここまで ▲▲▲▲▲
}

// 新機能: 選択キーの値の中間値を取得
function KOT_getMidpointSelectedKeyValue() {
    var data = KOT_getKeyData();
    if (!data) return null;
    var vals = data.overall.values;
    if (vals.length === 0) { alert("値を持つキーフレームが選択されていません。"); return null; }
    var minV = Math.min.apply(null, vals);
    var maxV = Math.max.apply(null, vals);
    return (minV + maxV) / 2;
}

// 新機能: 選択キーの中間フレームを取得
function KOT_getMidpointSelectedKeyFrame() {
    var data = KOT_getKeyData();
    if (!data) return null;
    var times = data.overall.times;
    if (times.length === 0) { alert("キーフレームが選択されていません。"); return null; }
    var minT = Math.min.apply(null, times);
    var maxT = Math.max.apply(null, times);
    var midTime = (minT + maxT) / 2;
    return midTime * data.comp.frameRate;
}

// ❷ 操作一括ハンドラ
function KOT_executeUnifiedOperation(direction) {
    app.beginUndoGroup("キー操作");

    var dummyKeyProps = [];
    var reselectMap = {};

    try {
        var dataForCheck = KOT_getKeyData();
        if (dataForCheck) {
            var comp = dataForCheck.comp;
            for (var pid in dataForCheck.propertyData) {
                var pData = dataForCheck.propertyData[pid];
                var prop  = pData.property;

                if (prop.matchName === "ADBE Time Remapping" &&
                    prop.numKeys > 0 &&
                    prop.numKeys === pData.keys.length) {

                    var lastKeyTime   = prop.keyTime(prop.numKeys);
                    var lastKeyValue  = prop.keyValue(prop.numKeys);
                    var dummyTime     = lastKeyTime + (1 / comp.frameRate / 100);
                    prop.setValueAtTime(dummyTime, lastKeyValue);
                    
                    dummyKeyProps.push({ property : prop, time : dummyTime });
                }
            }
        } else {
             app.endUndoGroup(); return;
        }

        if (ui.moveRadio.value) {
            var val = parseFloat(ui.moveValueInput.text);
            if (isNaN(val)) { alert("移動量が無効です。"); return; }
            var axis = (direction === "up" || direction === "down") ? "value" : "time";
            if (direction === "down" || direction === "left") val = -val;
            reselectMap = KOT_moveKeys(axis, val);

        } else if (ui.scaleRadio.value) {
            var factor = parseFloat(ui.scaleValueInput.text);
            if (isNaN(factor)) { alert("スケール値が無効です。"); return; }
            var axis = (direction === "up" || direction === "down") ? "value" : "time";
            reselectMap = KOT_scaleKeys(axis, factor, direction);

        } else if (ui.absoluteRadio.value) {
            reselectMap = KOT_alignKeys(true,  direction);

        } else if (ui.relativeRadio.value) {
            reselectMap = KOT_alignKeys(false, direction);
        }

    } catch (e) {
        alert("エラーが発生しました: " + e.toString());
    } finally {
        for (var i = 0; i < dummyKeyProps.length; i++) {
            try {
                var info   = dummyKeyProps[i];
                var prop   = info.property;
                var rmIdx  = prop.nearestKeyIndex(info.time);

                if (Math.abs(prop.keyTime(rmIdx) - info.time) < 0.0001) {
                    prop.removeKey(rmIdx);
                }
            } catch (err) { }
        }
        
        KOT_applyReselectMap(reselectMap);

        app.endUndoGroup();
    }
}

// --- キーの移動 ---
function KOT_moveKeys(axis, amount) {
    var data = KOT_getKeyData();
    if (!data) return null;

    // ▼▼▼▼▼ 修正箇所（レイヤー順追加機能） ▼▼▼▼▼
    var useLayerOrder = ui.layerOrderCheckbox.value;
    var layerOrderStep = useLayerOrder ? parseFloat(ui.layerOrderValueInput.text) : 0;
    if (isNaN(layerOrderStep) || !isFinite(layerOrderStep)) layerOrderStep = 0;
    // ▲▲▲▲▲ 修正ここまで ▲▲▲▲▲

    if (axis === "value") {
        for (var i = 0; i < data.overall.keys.length; i++) {
            var k = data.overall.keys[i];
            var prop = k.property;
            var idx  = k.key.index;
            var val = k.key.value;

            if (typeof val !== 'number' && !(val instanceof Array)) {
                continue;
            }
            
            // ▼▼▼▼▼ 修正箇所（レイヤーごとの移動量計算） ▼▼▼▼▼
            var layer = prop.propertyGroup(prop.propertyDepth);
            var selectionOrderIndex = data.layerOrderMap[layer.index];
            var finalAmount = (useLayerOrder && typeof selectionOrderIndex !== 'undefined') ? amount + (selectionOrderIndex * layerOrderStep) : amount;
            
            var delta = finalAmount;
            if (prop.matchName === "ADBE Time Remapping") delta /= data.comp.frameRate;

            var newVal = (val instanceof Array) ? val.slice(0) : val + delta;
            if (newVal instanceof Array) {
                for (var v = 0; v < newVal.length; v++) newVal[v] += delta;
            }
            // ▲▲▲▲▲ 修正ここまで ▲▲▲▲▲
            newVal = KOT_clampValue(prop, newVal);
            prop.setValueAtKey(idx, newVal);
        }

        var currentData = KOT_getKeyData();
        var map = {};
        if(currentData){
            for (var pid in currentData.propertyData) {
                var pData = currentData.propertyData[pid];
                var prop = pData.property;
                var layer = prop.propertyGroup(prop.propertyDepth);
                var uniqId = "L" + layer.index + "_D" + prop.propertyDepth + "_P" + prop.propertyIndex;
                map[uniqId] = { property: prop, indices: [] };
                for(var j = 0; j < pData.keys.length; j++){
                    map[uniqId].indices.push(pData.keys[j].index);
                }
            }
        }
        return map;

    } else { // time
        var newKeys = [];
        for (var i = 0; i < data.overall.keys.length; i++) {
            var ki = data.overall.keys[i];
            
            // ▼▼▼▼▼ 修正箇所（レイヤーごとの移動量計算） ▼▼▼▼▼
            var prop = ki.property;
            var layer = prop.propertyGroup(prop.propertyDepth);
            var selectionOrderIndex = data.layerOrderMap[layer.index];
            var finalAmount = (useLayerOrder && typeof selectionOrderIndex !== 'undefined') ? amount + (selectionOrderIndex * layerOrderStep) : amount;
            // ▲▲▲▲▲ 修正ここまで ▲▲▲▲▲
            
            var nk = {
                property: ki.property,
                time: ki.key.time + (finalAmount / data.comp.frameRate), // finalAmountを使用
                value: ki.key.value,
                easeIn:  ki.key.easeIn,
                easeOut: ki.key.easeOut,
                interpolationIn:  ki.key.interpolationIn,
                interpolationOut: ki.key.interpolationOut,
                continuous      : ki.key.continuous,
                autoBezier      : ki.key.autoBezier
            };
            newKeys.push(nk);
        }
        return KOT_regenerateKeys(data.overall.keys, newKeys);
    }
}

// --- スケール処理 ---
function KOT_scaleKeys(axis, factor, direction) {
    var data = KOT_getKeyData();
    if (!data) return null;

    // ▼▼▼▼▼ 修正箇所（レイヤー順追加機能） ▼▼▼▼▼
    var useLayerOrder = ui.layerOrderCheckbox.value;
    var layerOrderStep = useLayerOrder ? parseFloat(ui.layerOrderValueInput.text) : 0;
    if (isNaN(layerOrderStep) || !isFinite(layerOrderStep)) layerOrderStep = 0;
    // ▲▲▲▲▲ 修正ここまで ▲▲▲▲▲

    var origin;
    if (ui.minMaxCheckbox.value) {
        origin = (axis === "time")
            ? ((direction === "left") ? Math.max.apply(null, data.overall.times)
                                      : Math.min.apply(null, data.overall.times))
            : ((direction === "up")   ? Math.min.apply(null, data.overall.values)
                                      : Math.max.apply(null, data.overall.values));
    } else if (ui.cursorCheckbox.value) {
        origin = (axis === "time") ? data.comp.time : 0;
    } else {
        origin = parseFloat(ui.numericValue.text);
        if (axis === "time") origin /= data.comp.frameRate;
    }
    if (isNaN(origin)) { alert("基準値が無効です。"); return null; }

    var newKeys = [];
    
    for (var i = 0; i < data.overall.keys.length; i++) {
        var src = data.overall.keys[i];
        var prop = src.property;
        var keyInfo = src.key;

        // ▼▼▼▼▼ 修正箇所（レイヤーごとのスケール値計算） ▼▼▼▼▼
        var layer = prop.propertyGroup(prop.propertyDepth);
        var selectionOrderIndex = data.layerOrderMap[layer.index];
        var finalFactor = (useLayerOrder && typeof selectionOrderIndex !== 'undefined') ? factor + (selectionOrderIndex * layerOrderStep) : factor;
        var invFactor = (finalFactor === 0) ? 1 : 1 / finalFactor;
        // ▲▲▲▲▲ 修正ここまで ▲▲▲▲▲

        var nk  = { property: prop, time: keyInfo.time, value: keyInfo.value, easeIn: cloneEase(keyInfo.easeIn), easeOut: cloneEase(keyInfo.easeOut), interpolationIn: keyInfo.interpolationIn, interpolationOut: keyInfo.interpolationOut, continuous: keyInfo.continuous, autoBezier: keyInfo.autoBezier };

        if (axis === "time") {
            nk.time = origin + (keyInfo.time - origin) * finalFactor; // finalFactorを使用
            var isFirstKeyOfProperty = (keyInfo.index === 1); 
            var isLastKeyOfProperty = (keyInfo.index === prop.numKeys); 

            if (finalFactor < 0) { // finalFactorを使用
                var tmpIn  = cloneEase(keyInfo.easeIn);
                var tmpOut = cloneEase(keyInfo.easeOut);
                nk.easeIn  = []; nk.easeOut = [];
                var len = Math.max(tmpIn.length, tmpOut.length);
                for (var j = 0; j < len; j++) {
                    var ei = tmpIn [j] ? tmpIn [j] : new KeyframeEase(0, 0);
                    var eo = tmpOut[j] ? tmpOut[j] : new KeyframeEase(0, 0);
                    nk.easeIn .push(new KeyframeEase(-eo.speed, eo.influence));
                    nk.easeOut.push(new KeyframeEase(-ei.speed, ei.influence));
                }
                var tmp = nk.interpolationIn;
                nk.interpolationIn  = nk.interpolationOut;
                nk.interpolationOut = tmp;
            } else if (Math.abs(finalFactor - 1) > 1e-4) { // finalFactorを使用
                if (!isFirstKeyOfProperty) {
                    for (var e = 0; e < nk.easeIn.length;  e++) nk.easeIn[e].speed *= invFactor;
                }
                if (!isLastKeyOfProperty) {
                    for (var e = 0; e < nk.easeOut.length; e++) nk.easeOut[e].speed *= invFactor;
                }
            }
        } else {
            var originVal = (prop.matchName === "ADBE Time Remapping") ? origin / data.comp.frameRate : origin;
            if (nk.value instanceof Array) {
                for (var v = 0; v < nk.value.length; v++) nk.value[v] = originVal + (nk.value[v] - originVal) * finalFactor; // finalFactorを使用
            } else {
                nk.value = originVal + (nk.value - originVal) * finalFactor; // finalFactorを使用
            }
            nk.value = KOT_clampValue(prop, nk.value);
            if (Math.abs(finalFactor - 1) > 1e-4) { // finalFactorを使用
                for (var e = 0; e < nk.easeIn.length;  e++) nk.easeIn[e].speed  *= finalFactor; // finalFactorを使用
                for (var e = 0; e < nk.easeOut.length; e++) nk.easeOut[e].speed *= finalFactor; // finalFactorを使用
            }
        }
        newKeys.push(nk);
    }
    return KOT_regenerateKeys(data.overall.keys, newKeys);
}


// --- キーの整列 ---
function KOT_alignKeys(isAbsolute, direction) {
    var data = KOT_getKeyData();
    if (!data) return null;

    var axis = (direction === "up" || direction === "down") ? "value" : "time";
    var overall = data.overall;
    var tMin = (axis === "time") ? Math.min.apply(null, overall.times) : Math.min.apply(null, overall.values);
    var tMax = (axis === "time") ? Math.max.apply(null, overall.times) : Math.max.apply(null, overall.values);

    var target;
    if (ui.minMaxCheckbox.value) {
        target = (axis === "time") ? ((direction === "left") ? tMin : tMax) : ((direction === "down") ? tMin : tMax);
    } else if (ui.cursorCheckbox.value && axis === "time") {
        target = data.comp.time;
    } else {
        target = parseFloat(ui.numericValue.text);
        if (axis === "time") target /= data.comp.frameRate;
    }
    if (isNaN(target)) { alert("基準値が無効です。"); return null; }

    var newKeys = [];
    if (isAbsolute) {
        for (var i = 0; i < overall.keys.length; i++) {
            var k = overall.keys[i];
            var newTime = (axis === "time") ? target : k.key.time;
            
            var newValue;
            if (axis === "value") {
                var originalValue = k.key.value;
                if (originalValue instanceof Array) {
                    newValue = [];
                    for (var v = 0; v < originalValue.length; v++) {
                        newValue.push(target);
                    }
                } else {
                    if (k.property.matchName === "ADBE Time Remapping") {
                        newValue = target / data.comp.frameRate;
                    } else {
                        newValue = target;
                    }
                }
                newValue = KOT_clampValue(k.property, newValue);
            } else {
                newValue = k.key.value;
            }
            newKeys.push({ property: k.property, time: newTime, value: newValue, easeIn: cloneEase(k.key.easeIn), easeOut: cloneEase(k.key.easeOut), interpolationIn: k.key.interpolationIn, interpolationOut: k.key.interpolationOut, continuous: k.key.continuous, autoBezier: k.key.autoBezier });
        }
    } else {
        for (var pid in data.propertyData) {
            var p = data.propertyData[pid];
            var src = (axis === "time") ? ((direction === "left") ? Math.min.apply(null, p.times) : Math.max.apply(null, p.times)) : ((direction === "down") ? Math.min.apply(null, p.values) : Math.max.apply(null, p.values));
            var diff = target - src;
            if (isNaN(diff)) continue;

            for (var ki = 0; ki < p.keys.length; ki++) {
                var k = p.keys[ki];
                var newTime = (axis === "time") ? k.time + diff : k.time;
                var newValue;
                if (axis === "value") {
                    var orig = k.value;
                    if (orig instanceof Array) {
                        newValue = [];
                        for (var j = 0; j < orig.length; j++) newValue.push(orig[j] + diff);
                    } else {
                        newValue = orig + diff;
                    }
                    newValue = KOT_clampValue(p.property, newValue);
                } else {
                    newValue = k.value;
                }
                newKeys.push({ property: p.property, time: newTime, value: newValue, easeIn: cloneEase(k.easeIn), easeOut: cloneEase(k.easeOut), interpolationIn: k.interpolationIn, interpolationOut: k.interpolationOut, continuous: k.continuous, autoBezier: k.autoBezier });
            }
        }
    }
    return KOT_regenerateKeys(overall.keys, newKeys);
}

// ❸ キーデータ収集
function KOT_getKeyData() {
    var comp = app.project.activeItem;
    if (!(comp && comp instanceof CompItem)) { alert("コンポジションを選択してください。"); return null; }

    var propertyData   = {};
    var overallKeyData = { times: [], values: [], keys: [] };

    var selectedLayers = comp.selectedLayers;
    if (selectedLayers.length === 0) { alert("レイヤーを選択してください。"); return null; }
    
    // ▼▼▼▼▼ 修正箇所（選択レイヤーの順番を記録するマップを作成） ▼▼▼▼▼
    var layerOrderMap = {};
    for (var i = 0; i < selectedLayers.length; i++) {
        layerOrderMap[selectedLayers[i].index] = i;
    }
    // ▲▲▲▲▲ 修正ここまで ▲▲▲▲▲

    for (var i = 0; i < selectedLayers.length; i++) {
        var layer = selectedLayers[i];
        var props = layer.selectedProperties;

        for (var j = 0; j < props.length; j++) {
            var prop = props[j];
            if (!prop.canVaryOverTime || prop.numKeys === 0) continue;

            var uniqId  = "L" + layer.index + "_D" + prop.propertyDepth + "_P" + prop.propertyIndex;
            var propKeyData = { property: prop, keys: [], times: [], values: [] };

            for (var k = 1; k <= prop.numKeys; k++) {
                if (prop.keySelected(k)) {
                    var keyInfo = {
                        index          : k, time: prop.keyTime(k), value: prop.keyValue(k),
                        easeIn         : prop.keyInTemporalEase(k), easeOut: prop.keyOutTemporalEase(k),
                        interpolationIn: prop.keyInInterpolationType(k), interpolationOut:prop.keyOutInterpolationType(k),
                        continuous     : prop.keyTemporalContinuous(k), autoBezier: prop.keyTemporalAutoBezier(k)
                    };
                    propKeyData.keys.push(keyInfo);
                    propKeyData.times.push(keyInfo.time);
                    overallKeyData.keys.push({ property: prop, key: keyInfo });
                    overallKeyData.times.push(keyInfo.time);
                    
                    if (prop.matchName === "ADBE Time Remapping") {
                        var valAsFrame = keyInfo.value * comp.frameRate;
                        overallKeyData.values.push(valAsFrame);
                        propKeyData.values.push(valAsFrame);
                    } else if (keyInfo.value instanceof Array) {
                        overallKeyData.values = overallKeyData.values.concat(keyInfo.value);
                        propKeyData.values    = propKeyData.values.concat(keyInfo.value);
                    } else {
                        overallKeyData.values.push(keyInfo.value);
                        propKeyData.values.push(keyInfo.value);
                    }
                }
            }
            if (propKeyData.keys.length > 0) {
                 propertyData[uniqId] = propKeyData;
            }
        }
    }
    if (overallKeyData.keys.length === 0) { alert("キーフレームを選択してください。"); return null; }
    
    // ▼▼▼▼▼ 修正箇所（returnオブジェクトにマップを追加） ▼▼▼▼▼
    return { propertyData: propertyData, overall: overallKeyData, comp: comp, layerOrderMap: layerOrderMap };
    // ▲▲▲▲▲ 修正ここまで ▲▲▲▲▲
}


// --- ❹ キーの再生成（タイムリマップ余分キー自動除去版） --------------------
function KOT_regenerateKeys(keysToRemove, newKeys) {
    // 1) 既存キーを削除（降順）
    keysToRemove.sort(function (a, b) { return b.key.index - a.key.index; });
    for (var i = 0; i < keysToRemove.length; i++) {
        try { keysToRemove[i].property.removeKey(keysToRemove[i].key.index); } catch (e) {}
    }

    var idxMap       = {};   // { uniqId: [indices…] }
    var reselectMap  = {};   // { uniqId: {property, indices[]} }

    // 2) 新しいキーを打ち直し
    for (var i = 0; i < newKeys.length; i++) {
        var d = newKeys[i];

        if (d.property.matchName === "ADBE Time Remapping") {
            var lyr = d.property.propertyGroup(d.property.propertyDepth);
            if (lyr instanceof AVLayer && !lyr.timeRemapEnabled) lyr.timeRemapEnabled = true;
        }

        d.property.setValueAtTime(d.time, d.value);
        var idx = d.property.nearestKeyIndex(d.time);

        d.property.setInterpolationTypeAtKey(idx, d.interpolationIn, d.interpolationOut);

        var isHold =
            (d.interpolationIn  === KeyframeInterpolationType.HOLD) ||
            (d.interpolationOut === KeyframeInterpolationType.HOLD);
        var isBothLinear =
            (d.interpolationIn  === KeyframeInterpolationType.LINEAR) &&
            (d.interpolationOut === KeyframeInterpolationType.LINEAR);

        if (!isHold && !isBothLinear) {
            if (typeof d.continuous !== "undefined")
                d.property.setTemporalContinuousAtKey(idx, d.continuous);
            d.property.setTemporalAutoBezierAtKey(idx, false);
            d.property.setTemporalEaseAtKey(idx, d.easeIn, d.easeOut);
        }

        if (d.autoBezier && !isHold) {
            d.property.setTemporalAutoBezierAtKey(idx, true);
        }

        var layer   = d.property.propertyGroup(d.property.propertyDepth);
        var uniqId  = "L" + layer.index + "_D" + d.property.propertyDepth + "_P" + d.property.propertyIndex;
        if (!reselectMap[uniqId]) {
            reselectMap[uniqId] = { property: d.property, indices: [] };
            idxMap[uniqId]      = [];
        }
        reselectMap[uniqId].indices.push(idx);
        idxMap[uniqId].push(idx);
    }

    // エラーの原因となっていたため、このブロック全体を無効化（コメントアウト）します。
    // ダミーキー方式の導入により、この予備処理は不要になりました。
    /*
    // 3) タイムリマップ特有の余分キーを除去
    for (var id in reselectMap) {
        var item = reselectMap[id];
        var prop = item.property;
        if (prop.matchName !== "ADBE Time Remapping") continue;

        var layer     = prop.propertyGroup(prop.propertyDepth);
        var startT    = layer.inPoint;
        var endT      = layer.outPoint;
        var keepIdx   = idxMap[id];
        var frameTol  = 1 / layer.containingComp.frameRate / 10;

        for (var k = prop.numKeys; k >= 1; k--) {
            if (keepIdx && keepIdx.indexOf(k) !== -1) continue;
            var t = prop.keyTime(k);
            if (Math.abs(t - startT) < frameTol || Math.abs(t - endT) < frameTol) {
                try { prop.removeKey(k); } catch (e) {}
            }
        }
    }
    */

    return reselectMap;
}


// --- reselectMapに基づいてキーを選択するヘルパー関数 ---
function KOT_applyReselectMap(reselectMap) {
    if (!reselectMap) return;
    for (var id in reselectMap) {
        if (reselectMap.hasOwnProperty(id)) {
            var item = reselectMap[id];
            if (!item || !item.property) continue;
            
            for (var k = 1; k <= item.property.numKeys; k++) {
                try { item.property.setSelectedAtKey(k, false); } catch(e){}
            }
            var inds = item.indices;
            for (var j = 0; j < inds.length; j++) {
                try {
                    item.property.setSelectedAtKey(inds[j], true);
                } catch (e) { }
            }
        }
    }
}

// --- キーのフレーム位置を整数に ---
function KOT_roundKeyframePositions() {
    var data = KOT_getKeyData();
    if (!data) return;
    app.beginUndoGroup("キーのフレーム位置を整数に");
    var newKeys = [];
    for (var i = 0; i < data.overall.keys.length; i++) {
         var keyItem = data.overall.keys[i];
         // ▼▼▼▼▼ 修正済み箇所 ▼▼▼▼▼
         var newKey = {
            property: keyItem.property,
            time: keyItem.key.time,
            value: keyItem.key.value,
            easeIn: cloneEase(keyItem.key.easeIn),
            easeOut: cloneEase(keyItem.key.easeOut),
            interpolationIn: keyItem.key.interpolationIn,
            interpolationOut: keyItem.key.interpolationOut,
            continuous: keyItem.key.continuous,
            autoBezier: keyItem.key.autoBezier
        };
        // ▲▲▲▲▲ 修正済みここまで ▲▲▲▲▲
         newKey.time = Math.round(newKey.time * data.comp.frameRate) / data.comp.frameRate;
         newKeys.push(newKey);
    }
    var reselectMap = KOT_regenerateKeys(data.overall.keys, newKeys);
    KOT_applyReselectMap(reselectMap);
    app.endUndoGroup();
}

// タイムリマップと不透明度の値を有効範囲に丸める（クランプする）汎用関数
function KOT_clampValue(property, value) {
    if (value instanceof Array) {
        return value;
    }
    switch (property.matchName) {
        case "ADBE Time Remapping":
            try {
                var layer = property.propertyGroup(property.propertyDepth);
                if (layer instanceof AVLayer) {
                    var maxDuration = layer.source.duration;
                    if (value < 0) return 0;
                    if (value > maxDuration) return maxDuration;
                }
            } catch (e) { if (value < 0) return 0; }
            break; 
        case "ADBE Opacity":
            if (value < 0) return 0;
            if (value > 100) return 100;
            break;
    }
    return value;
}

// --- 選択されたキーフレームの値の平均を取得する関数 ---
function KOT_getAverageSelectedKeyValue() {
    var data = KOT_getKeyData();
    if (!data) return null;
    var sum = 0;
    var count = 0;
    for (var i = 0; i < data.overall.keys.length; i++) {
        var k = data.overall.keys[i];
        var value = k.key.value;
        var prop = k.property;
        if (value instanceof Array) {
            for (var v = 0; v < value.length; v++) { sum += value[v]; count++; }
        } else if (typeof value === "number") {
            if (prop.matchName === "ADBE Time Remapping") {
                sum += value * data.comp.frameRate;
            } else {
                sum += value;
            }
            count++;
        }
    }
    if (count > 0) {
        return sum / count;
    } else {
        alert("値を持つキーフレームが選択されていません。");
        return null;
    }
}

// 初期化
ui = KOT_buildUI(this);
if (ui.panel && ui.panel instanceof Window) { ui.panel.center(); ui.panel.show(); }