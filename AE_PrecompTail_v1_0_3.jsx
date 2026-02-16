﻿﻿/**
 * Fit selected precomp layers to CTI by adjusting the SOURCE COMP duration (no Time Remap).
 *
 * 仕様:
 * - 選択したプリコンレイヤーの outPoint を CTI に合わせて「伸ばす／縮める」
 * - Time Remap 有効はスキップ
 * - stretch <= 0 はスキップ
 * - ソースComp(duration)は「伸ばす／縮める」どちらも常に実行（強制）
 * - 同じソースCompを参照している選択レイヤーが複数ある場合、必要尺は最大値に合わせる
 * - ポップアップなし
 */

(function fitPrecompToCTI_Force() {
    if (!app.project) { return; }

    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) { return; }

    var layers = comp.selectedLayers;
    if (!layers || layers.length === 0) { return; }

    var fps = comp.frameRate;
    var compFD = comp.frameDuration;

    function timeToFrameInt(t, frameRate) {
        // 表示単位がフレームのとき、"125" 等の整数が返る想定
        var s = timeToCurrentFormat(t, frameRate, true);
        var m = s.match(/-?\d+/);
        if (m && m[0] !== null) return parseInt(m[0], 10);

        // 保険
        return Math.floor((t * frameRate) + 1e-6);
    }

    // CTIを「UIフレーム番号」で確定（浮動小数誤差を根絶）
    var ctiFrame = timeToFrameInt(comp.time, fps);
    var ctiTime  = ctiFrame / fps;

    // outPoint は繰り上がり対策でほんの少し手前
    var outTime = ctiTime - (compFD * 1e-4);

    app.beginUndoGroup("Fit Precomp To CTI (Force Shrink)");

    // { [compId]: { comp: CompItem, newDurFrames: number } }
    var needMap = {};

    // 1) ソースCompに必要な尺（フレーム）を集計（伸縮両対応・強制縮めOK）
    for (var i = 0; i < layers.length; i++) {
        var lyr = layers[i];

        if (!(lyr instanceof AVLayer)) continue;
        if (!lyr.source || !(lyr.source instanceof CompItem)) continue;

        if (lyr.timeRemapEnabled) continue;
        if (lyr.stretch <= 0) continue;

        var srcComp = lyr.source;
        var srcFps  = srcComp.frameRate;

        // startTimeも UIフレームで整数化（誤差排除）
        var startFrame = timeToFrameInt(lyr.startTime, fps);
        var deltaCompFrames = ctiFrame - startFrame;

        // CTIが開始より前の場合、source尺計算は最小(1F)に寄せる（outPointは後段でinPointにクランプ）
        if (deltaCompFrames < 0) deltaCompFrames = 0;

        // 必要ソースフレーム = ceil(deltaCompFrames * srcFps * 100 / (fps * stretch))
        var numerator   = deltaCompFrames * srcFps * 100.0;
        var denominator = fps * lyr.stretch;

        var neededSrcFrames = Math.ceil(numerator / denominator);
        if (neededSrcFrames < 1) neededSrcFrames = 1;

        var key = String(srcComp.id);
        if (!needMap[key]) {
            needMap[key] = { comp: srcComp, newDurFrames: neededSrcFrames };
        } else {
            // 同一ソースCompを使う選択レイヤーが複数あれば、必要尺は最大に合わせる
            needMap[key].newDurFrames = Math.max(needMap[key].newDurFrames, neededSrcFrames);
        }
    }

    // 2) ソースComp duration を更新（伸ばす／縮める：どちらも常に実行）
    for (var k in needMap) {
        if (!needMap.hasOwnProperty(k)) continue;

        var obj = needMap[k];
        var src = obj.comp;

        try {
            var srcFps2 = src.frameRate;
            var newDurTime = obj.newDurFrames / srcFps2;

            // 強制：短くも長くも、その値に合わせる
            if (newDurTime !== src.duration) {
                src.duration = newDurTime;
                src.workAreaStart = 0;
                src.workAreaDuration = newDurTime;
            }
        } catch (e1) {
            // 黙ってスキップ
        }
    }

    // 3) 選択レイヤーの outPoint を CTI に合わせて「伸縮」
    for (var j = 0; j < layers.length; j++) {
        var lyr2 = layers[j];

        if (!(lyr2 instanceof AVLayer)) continue;
        if (!lyr2.source || !(lyr2.source instanceof CompItem)) continue;

        if (lyr2.timeRemapEnabled) continue;
        if (lyr2.stretch <= 0) continue;

        try {
            // inPointより前にならない保険（縮めで必須）
            var safeOut = Math.max(outTime, lyr2.inPoint + (compFD * 1e-4));
            lyr2.outPoint = safeOut;
        } catch (e2) {
            // 黙ってスキップ
        }
    }

    app.endUndoGroup();

})();
