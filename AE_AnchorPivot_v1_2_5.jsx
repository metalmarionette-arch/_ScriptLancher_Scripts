/*  PivotAnchorNull v1.0.0
    - UI: AE_AnchorPivot_v1_1_3.jsx 風（9点ピボット）
    - Bounds pick: AE_autoRect-like 風（sourceRectAtTime + toComp で回転込みの外接矩形を拾う）
    - Feature A: 各レイヤーのアンカーを指定ピボットへ移動（見た目維持のため Position を一定量シフト）
    - Feature B: 選択全体のバウンディングの指定ピボット位置にヌルを作り、選択を子に（Positionアニメを崩さない）
    - Parent handling: 既に親がある場合は「親ごと」にヌルを作成し、その親の子として作成
      さらに任意で「親の回転/スケールをヌルへコピー」可能（デフォルトON）
*/

(function PivotAnchorNullUI(thisObj) {

    var SCRIPT_NAME = "PivotAnchorNull";

    // ---------------- Utils ----------------
    function isCompItem(item) { return item && (item instanceof CompItem); }

    function getActiveComp() {
        var item = app.project.activeItem;
        if (!isCompItem(item)) return null;
        return item;
    }

    function alertErr(msg) { alert(msg, SCRIPT_NAME); }

    function safeName(layer) {
        try { return layer.name; } catch (e) { return "(no name)"; }
    }

    function safeErr(e) {
        try {
            var s = (e && e.toString) ? e.toString() : String(e);
            if (s.length > 260) s = s.substring(0, 260) + "...";
            return s;
        } catch (ee) {
            return "unknown_error";
        }
    }

    function isEditable(prop) {
        if (!prop) return false;
        try { if (prop.expressionEnabled === true) return false; } catch (e) {}
        return true;
    }

    function isNumber(n) { return (typeof n === "number") && isFinite(n); }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function uniqueNameInComp(comp, base) {
        var name = base, i = 2, exists = true;
        while (exists) {
            exists = false;
            for (var li = 1; li <= comp.numLayers; li++) {
                if (comp.layer(li).name === name) { exists = true; break; }
            }
            if (exists) name = base + " (" + (i++) + ")";
        }
        return name;
    }

    // ---------------- Transform access ----------------
    function getTransformGroup(layer) {
        if (!layer || !layer.property) return null;
        return layer.property("ADBE Transform Group");
    }

    function getAnchorProp(layer) {
        var tr = getTransformGroup(layer);
        if (!tr) return null;
        return tr.property("ADBE Anchor Point");
    }

    function getPositionProp(layer) {
        var tr = getTransformGroup(layer);
        if (!tr) return null;
        return tr.property("ADBE Position");
    }

    function getSeparatedPosProps(layer) {
        var tr = getTransformGroup(layer);
        if (!tr) return null;
        return {
            x: tr.property("ADBE Position_0"),
            y: tr.property("ADBE Position_1"),
            z: tr.property("ADBE Position_2")
        };
    }

    function getScaleProp(layer) {
        var tr = getTransformGroup(layer);
        if (!tr) return null;
        return tr.property("ADBE Scale");
    }

    function getRotationZProp(layer) {
        var tr = getTransformGroup(layer);
        if (!tr) return null;
        return tr.property("ADBE Rotate Z") || tr.property("ADBE Rotation");
    }

    function getVecAtTime(prop, t) {
        if (!prop) return null;
        try { return prop.valueAtTime(t, false); } catch (e) {}
        try { return prop.value; } catch (e2) {}
        return null;
    }

    function getAnchorXYAtTime(layer, t) {
        var ap = getAnchorProp(layer);
        if (!ap) return null;
        var v = getVecAtTime(ap, t);
        if (!v || v.length < 2) return null;
        return [v[0], v[1]];
    }

    function getScaleXYAtTime(layer, t) {
        var sc = getScaleProp(layer);
        if (!sc) return [1, 1];
        var v = getVecAtTime(sc, t);
        if (!v || v.length < 2) return [1, 1];
        return [v[0] / 100.0, v[1] / 100.0];
    }

    function getRotDegAtTime(layer, t) {
        var rp = getRotationZProp(layer);
        if (!rp) return 0;
        var v = getVecAtTime(rp, t);
        return (typeof v === "number") ? v : 0;
    }

    // ---------------- Rect helpers ----------------
    // sourceRectAtTime はアンカー相対（relToAnchor=true）
    // width/height fallback は左上原点（relToAnchor=false）
    function getLayerRectInfo(layer, t) {
        try {
            if (layer && layer.sourceRectAtTime) {
                var r = layer.sourceRectAtTime(t, false);
                if (r && (r.width !== undefined)) return { rect: r, relToAnchor: true };
            }
        } catch (e) {}

        var w = 0, h = 0;
        try { w = layer.width; h = layer.height; } catch (e2) {}
        return { rect: { left: 0, top: 0, width: w, height: h }, relToAnchor: false };
    }

    function rectPivotXY(rect, pivotKey) {
        var xL = rect.left;
        var xC = rect.left + rect.width / 2.0;
        var xR = rect.left + rect.width;

        var yT = rect.top;
        var yC = rect.top + rect.height / 2.0;
        var yB = rect.top + rect.height;

        if (pivotKey === "TL") return [xL, yT];
        if (pivotKey === "T")  return [xC, yT];
        if (pivotKey === "TR") return [xR, yT];

        if (pivotKey === "L")  return [xL, yC];
        if (pivotKey === "C")  return [xC, yC];
        if (pivotKey === "R")  return [xR, yC];

        if (pivotKey === "BL") return [xL, yB];
        if (pivotKey === "B")  return [xC, yB];
        if (pivotKey === "BR") return [xR, yB];

        return [xC, yC];
    }

    // ---------------- 2D math helpers ----------------
    function rsApply(deltaAnchorXY, sx, sy, rotDeg) {
        var rad = rotDeg * Math.PI / 180.0;
        var c = Math.cos(rad);
        var s = Math.sin(rad);

        var x = deltaAnchorXY[0] * sx;
        var y = deltaAnchorXY[1] * sy;

        return [ c * x - s * y, s * x + c * y ];
    }

    function offsetArray2DKeepLen(arr, dx, dy) {
        if (arr instanceof Array) {
            if (arr.length >= 3) return [arr[0] + dx, arr[1] + dy, arr[2]];
            return [arr[0] + dx, arr[1] + dy];
        }
        return arr;
    }

    // ---------------- Anchor shifting (keys-safe) ----------------
    function shiftAnchorLayer2D(layer, dx, dy) {
        var ap = getAnchorProp(layer);
        if (!ap) return { ok: false, reason: "no_anchor" };
        if (!isEditable(ap)) return { ok: false, reason: "anchor_expression" };

        try {
            if (ap.numKeys && ap.numKeys > 0) {
                for (var k = 1; k <= ap.numKeys; k++) {
                    var v = ap.keyValue(k);
                    ap.setValueAtKey(k, offsetArray2DKeepLen(v, dx, dy));
                }
            } else {
                ap.setValue(offsetArray2DKeepLen(ap.value, dx, dy));
            }
            return { ok: true };
        } catch (e) {
            return { ok: false, reason: "anchor_fail:" + safeErr(e) };
        }
    }

    // ---------------- Position shifting (constant delta; no warp) ----------------
    function shiftPositionByConstantDelta(layer, dPconst) {
        var dx = dPconst[0];
        var dy = dPconst[1];

        var pos = getPositionProp(layer);
        if (!pos) return { ok:false, reason:"no_position" };
        if (!isEditable(pos)) return { ok:false, reason:"pos_expression_or_locked" };

        // leader(Position) を試す
        try {
            if (pos.numKeys && pos.numKeys > 0) {
                for (var k = 1; k <= pos.numKeys; k++) {
                    var v = pos.keyValue(k);
                    pos.setValueAtKey(k, offsetArray2DKeepLen(v, dx, dy));
                }
            } else {
                pos.setValue(offsetArray2DKeepLen(pos.value, dx, dy));
            }
            return { ok: true };
        } catch (eLeader) {
            // separated followerへ
        }

        var sp = getSeparatedPosProps(layer);
        if (!sp || !sp.x || !sp.y) return { ok:false, reason:"pos_set_fail:leader_set_failed" };
        if (!isEditable(sp.x) || !isEditable(sp.y)) return { ok:false, reason:"pos_expression_or_locked" };

        try {
            if (sp.x.numKeys && sp.x.numKeys > 0) {
                for (var kx = 1; kx <= sp.x.numKeys; kx++) sp.x.setValueAtKey(kx, sp.x.keyValue(kx) + dx);
            } else {
                sp.x.setValue(sp.x.value + dx);
            }

            if (sp.y.numKeys && sp.y.numKeys > 0) {
                for (var ky = 1; ky <= sp.y.numKeys; ky++) sp.y.setValueAtKey(ky, sp.y.keyValue(ky) + dy);
            } else {
                sp.y.setValue(sp.y.value + dy);
            }

            return { ok: true };
        } catch (eSep) {
            return { ok: false, reason: "pos_set_fail:" + safeErr(eSep) };
        }
    }

    // ---------------- Robust eval via expression (toComp / fromComp) ----------------
    function evalAtCompTime(comp, t, fn) {
        var old = comp.time;
        var changed = false;
        try {
            if (Math.abs(old - t) > 1e-9) { comp.time = t; changed = true; }
            return fn();
        } finally {
            try { if (changed) comp.time = old; } catch (e) {}
        }
    }

    var __EVAL_HELPER = { comp: null, layer: null, ptProp: null };

    function numStr6(n) {
        if (!isNumber(n)) n = 0;
        var v = Math.round(n * 1000000) / 1000000;
        return String(v);
    }

    function cleanupEvalHelper() {
        try {
            if (__EVAL_HELPER && __EVAL_HELPER.layer) {
                try { __EVAL_HELPER.layer.locked = false; } catch (e0) {}
                __EVAL_HELPER.layer.remove();
            }
        } catch (e) {}
        __EVAL_HELPER = { comp: null, layer: null, ptProp: null };
    }

    function ensureEvalHelper(comp) {
        try {
            if (__EVAL_HELPER && __EVAL_HELPER.comp === comp && __EVAL_HELPER.layer && __EVAL_HELPER.ptProp) {
                var _ = __EVAL_HELPER.layer.index;
                var __ = __EVAL_HELPER.ptProp.value;
                return __EVAL_HELPER;
            }
        } catch (e0) {}

        cleanupEvalHelper();

        var h = null;
        try {
            h = comp.layers.addNull(comp.duration);
        } catch (e1) {
            try {
                h = comp.layers.addSolid([1,1,1], "__PAN_EVAL__", 100, 100, comp.pixelAspect, comp.duration);
            } catch (e2) {
                return null;
            }
        }

        try { h.name = "__PAN_EVAL__"; } catch (e3) {}
        try { h.guideLayer = true; } catch (e4) {}
        try { h.shy = true; } catch (e5) {}
        try { h.enabled = true; } catch (e6) {}
        try {
            var op = h.property("ADBE Transform Group").property("ADBE Opacity");
            if (op) op.setValue(0);
        } catch (e7) {}

        var ptProp = null;
        try {
            var fx = h.property("ADBE Effect Parade").addProperty("ADBE Point Control");
            fx.name = "__PAN_eval";
            ptProp = fx.property("ADBE Point Control-0001");
            ptProp.expressionEnabled = true;
        } catch (e8) {
            ptProp = null;
        }

        try { h.locked = true; } catch (e9) {}

        __EVAL_HELPER = { comp: comp, layer: h, ptProp: ptProp };
        return __EVAL_HELPER;
    }

    function evalExprPoint2D(comp, expr, t) {
        var H = ensureEvalHelper(comp);
        if (!H || !H.ptProp) return null;

        return evalAtCompTime(comp, t, function () {
            try {
                H.ptProp.expression = expr;
                H.ptProp.expressionEnabled = true;
                var v = H.ptProp.value;
                if (!v || v.length < 2) return null;
                if (!isNumber(v[0]) || !isNumber(v[1])) return null;
                return [v[0], v[1]];
            } catch (e) {
                return null;
            }
        });
    }

    function toComp2D_expr(layer, comp, t, x, y) {
        var idx = -1;
        try { idx = layer.index; } catch (e0) { return null; }
        if (!isNumber(x) || !isNumber(y)) return null;

        var expr =
            "var L=thisComp.layer(" + idx + ");\n" +
            "var p=L.toComp([" + numStr6(x) + "," + numStr6(y) + ",0]);\n" +
            "[p[0],p[1]];";

        return evalExprPoint2D(comp, expr, t);
    }

    function fromComp2D_expr(layer, comp, t, x, y) {
        var idx = -1;
        try { idx = layer.index; } catch (e0) { return null; }
        if (!isNumber(x) || !isNumber(y)) return null;

        var expr =
            "var L=thisComp.layer(" + idx + ");\n" +
            "var p=L.fromComp([" + numStr6(x) + "," + numStr6(y) + ",0]);\n" +
            "[p[0],p[1]];";

        return evalExprPoint2D(comp, expr, t);
    }

// ★差し替え①：アンカー点の comp 座標を正しく取る（重要）
function getAnchorCompPos2D(layer, comp, t) {
    var idx = -1;
    try { idx = layer.index; } catch (e0) { return null; }

    // ここが肝：toComp([0,0,0]) ではなく toComp(anchorPoint)
    var expr =
        "var L=thisComp.layer(" + idx + ");\n" +
        "var p=L.toComp(L.anchorPoint);\n" +
        "[p[0],p[1]];";

    return evalExprPoint2D(comp, expr, t);
}


    // ★差し替え②：bounds の四隅も “anchorPoint加算→toComp” で揃える（安定化）
    function getLayerBoundsComp2D(layer, comp, t) {
        return evalAtCompTime(comp, t, function () {

            // Anchor Point（レイヤー座標系）
            var ap = getAnchorXYAtTime(layer, t);
            if (!ap) ap = [0, 0];

            var rect = null;
            try {
                if (layer && layer.sourceRectAtTime) rect = layer.sourceRectAtTime(t, false);
            } catch (e0) {
                rect = null;
            }

            var x1, y1, x2, y2;

            if (rect && (rect.width !== undefined) && (rect.height !== undefined)) {
                // sourceRectAtTime はアンカー基準の値になりやすいので、
                // レイヤー座標へ戻す： corner = rect + anchorPoint
                x1 = rect.left + ap[0];
                y1 = rect.top  + ap[1];
                x2 = x1 + rect.width;
                y2 = y1 + rect.height;
            } else {
                // fallback：フッテージ等
                var w = 0, h = 0;
                try { w = layer.width; h = layer.height; } catch (e1) {}
                x1 = 0; y1 = 0; x2 = w; y2 = h;
            }

            // 四隅を comp に変換（回転/スケール込み）
            var p1 = toComp2D_expr(layer, comp, t, x1, y1);
            var p2 = toComp2D_expr(layer, comp, t, x2, y1);
            var p3 = toComp2D_expr(layer, comp, t, x2, y2);
            var p4 = toComp2D_expr(layer, comp, t, x1, y2);

            if (!p1 || !p2 || !p3 || !p4) {
                // 最低限アンカー点だけでも返す
                var a = getAnchorCompPos2D(layer, comp, t);
                if (!a) return null;
                return { minX: a[0], maxX: a[0], minY: a[1], maxY: a[1] };
            }

            var minX = p1[0], maxX = p1[0];
            var minY = p1[1], maxY = p1[1];
            var pts = [p2, p3, p4];

            for (var i = 0; i < pts.length; i++) {
                if (pts[i][0] < minX) minX = pts[i][0];
                if (pts[i][0] > maxX) maxX = pts[i][0];
                if (pts[i][1] < minY) minY = pts[i][1];
                if (pts[i][1] > maxY) maxY = pts[i][1];
            }

            return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
        });
    }


    function unionBounds(a, b) {
        if (!a) return b;
        if (!b) return a;
        return {
            minX: Math.min(a.minX, b.minX),
            maxX: Math.max(a.maxX, b.maxX),
            minY: Math.min(a.minY, b.minY),
            maxY: Math.max(a.maxY, b.maxY)
        };
    }

    function getPivotFromBounds(bounds, pivotKey) {
        if (!bounds) return null;

        var xL = bounds.minX, xR = bounds.maxX;
        var yT = bounds.minY, yB = bounds.maxY;
        var xC = (xL + xR) / 2.0;
        var yC = (yT + yB) / 2.0;

        if (pivotKey === "TL") return [xL, yT];
        if (pivotKey === "T")  return [xC, yT];
        if (pivotKey === "TR") return [xR, yT];

        if (pivotKey === "L")  return [xL, yC];
        if (pivotKey === "C")  return [xC, yC];
        if (pivotKey === "R")  return [xR, yC];

        if (pivotKey === "BL") return [xL, yB];
        if (pivotKey === "B")  return [xC, yB];
        if (pivotKey === "BR") return [xR, yB];

        return [xC, yC];
    }

    // ---------------- Feature A: Move Anchor (each layer) ----------------
    function makeConstOffsetFromAnchorDelta(layer, dA, tNow) {
        var sxsy = getScaleXYAtTime(layer, tNow);
        var rot  = getRotDegAtTime(layer, tNow);
        return rsApply(dA, sxsy[0], sxsy[1], rot);
    }

    function processEachLayerMoveAnchor(layer, comp, tNow, pivotKey) {
        if (!layer || layer.locked) return { ok:false, reason:"locked" };
        if (!comp) return { ok:false, reason:"no_comp" };
        if (!getTransformGroup(layer)) return { ok:false, reason:"no_transform" };

        var ap = getAnchorProp(layer);
        var pos = getPositionProp(layer);
        if (!ap || !pos) return { ok:false, reason:"no_props" };
        if (!isEditable(ap)) return { ok:false, reason:"anchor_expression" };

        // ★ここを「comp⇄layer変換」ではなく、AnchorPoint と同じ座標系（レイヤー座標）で
        // 目的のピボット座標を直接作るように変更します。
        // これで、実行後の AnchorPoint の値が「[0,62]」のようにピボット座標そのものになり、
        // 何度実行してもズレません。

        var rect = null;
        try {
            if (layer && layer.sourceRectAtTime) rect = layer.sourceRectAtTime(tNow, false);
        } catch (e0) {
            rect = null;
        }

        var xL, xR, yT, yB;

        if (rect && (rect.width !== undefined) && (rect.height !== undefined)) {
            // sourceRectAtTime は AnchorPoint と同じレイヤー座標系（テキスト/シェイプ用）で返る想定
            xL = rect.left;
            yT = rect.top;
            xR = rect.left + rect.width;
            yB = rect.top  + rect.height;
        } else {
            // fallback：フッテージ等（原点=左上、AnchorPoint はその座標系）
            var w = 0, h = 0;
            try { w = layer.width; h = layer.height; } catch (e1) {}
            xL = 0; yT = 0; xR = w; yB = h;
        }

        var xC = (xL + xR) / 2.0;
        var yC = (yT + yB) / 2.0;

        var targetA = null;
        if (pivotKey === "TL") targetA = [xL, yT];
        else if (pivotKey === "T")  targetA = [xC, yT];
        else if (pivotKey === "TR") targetA = [xR, yT];
        else if (pivotKey === "L")  targetA = [xL, yC];
        else if (pivotKey === "C")  targetA = [xC, yC];
        else if (pivotKey === "R")  targetA = [xR, yC];
        else if (pivotKey === "BL") targetA = [xL, yB];
        else if (pivotKey === "B")  targetA = [xC, yB];
        else if (pivotKey === "BR") targetA = [xR, yB];
        else targetA = [xC, yC];

        // 現在のアンカー（レイヤー座標）
        var curA = getAnchorXYAtTime(layer, tNow);
        if (!curA) return { ok:false, reason:"no_anchor_value" };

        // 目的値に合わせるための差分
        var dA = [targetA[0] - curA[0], targetA[1] - curA[1]];

        // 微小誤差は無視
        if (Math.abs(dA[0]) < 1e-6 && Math.abs(dA[1]) < 1e-6) return { ok:true };

        // AnchorPoint を目的値へ（全キーに一括適用）
        var r1 = shiftAnchorLayer2D(layer, dA[0], dA[1]);
        if (!r1.ok) return { ok:false, reason:r1.reason };

        // 見た目維持：Position を一定量シフト
        var dPconst = makeConstOffsetFromAnchorDelta(layer, dA, tNow);
        var r2 = shiftPositionByConstantDelta(layer, dPconst);
        if (!r2.ok) return { ok:false, reason:r2.reason };

        return { ok:true };
    }


    // ---------------- Null creation helpers ----------------
    function addPivotNullLayer(comp, nameBase) {
        var nl = null;
        try {
            nl = comp.layers.addNull(comp.duration);
        } catch (e1) {
            try {
                nl = comp.layers.addSolid([1,1,1], nameBase, 100, 100, comp.pixelAspect, comp.duration);
            } catch (e2) {
                return { ok:false, reason:"null_add_fail:" + safeErr(e2) };
            }
        }

        try { nl.name = uniqueNameInComp(comp, nameBase); } catch (e3) {}
        try { nl.enabled = true; } catch (e4) {}
        try { nl.shy = false; } catch (e5) {}
        try { nl.guideLayer = false; } catch (e6) {}

        // 子の計算を安定させるためアンカーは [0,0]
        try {
            var ap = getAnchorProp(nl);
            if (ap && isEditable(ap)) {
                var v = ap.value;
                if (v instanceof Array && v.length >= 3) ap.setValue([0,0,v[2]]);
                else ap.setValue([0,0]);
            }
        } catch (e7) {}

        return { ok:true, layer:nl };
    }

    function setPosition2D(layer, xy) {
        var pos = getPositionProp(layer);
        if (!pos) return false;
        if (!isEditable(pos)) return false;
        try {
            // z は維持
            var v = pos.value;
            if (v instanceof Array && v.length >= 3) pos.setValue([xy[0], xy[1], v[2]]);
            else pos.setValue([xy[0], xy[1]]);
            return true;
        } catch (e) {
            return false;
        }
    }

    function copyRotScaleFromParent(parentLayer, targetLayer, tNow) {
        // 要望: 親の回転とスケールをコピーしてヌルへ適用
        // ※階層次第で見た目が変わる可能性あり（UIでON/OFF）
        try {
            var sP = getScaleProp(parentLayer);
            var rP = getRotationZProp(parentLayer);

            var sT = getScaleProp(targetLayer);
            var rT = getRotationZProp(targetLayer);

            if (sP && sT && isEditable(sT)) {
                var sv = getVecAtTime(sP, tNow);
                if (sv && sv.length >= 2) sT.setValue(sv);
            }

            if (rP && rT && isEditable(rT)) {
                var rv = getVecAtTime(rP, tNow);
                if (typeof rv === "number") rT.setValue(rv);
            }
        } catch (e) {}
    }

    function calcPosInParentSpace(parentLayer, comp, tNow, compXY) {
        if (!parentLayer) return compXY;
        var p = fromComp2D_expr(parentLayer, comp, tNow, compXY[0], compXY[1]);
        return p ? p : compXY;
    }

    // ---------------- Feature B: Parent to Pivot Null (keep Position anim) ----------------
    function buildDesiredPositionValuesForNewParent(layer, comp, newParentLayer) {
        var pos = getPositionProp(layer);
        if (!pos) return { ok:false, reason:"no_position" };

        if (!isEditable(pos)) return { ok:false, reason:"pos_expression_or_locked" };

        var sp = getSeparatedPosProps(layer);
        var isSep = false;
        try { isSep = (pos.dimensionsSeparated === true); } catch (e0) { isSep = false; }

        function calcNewPosAtTime(tt) {
            // もとの「アンカー点 comp 座標」
            var compAnchor = getAnchorCompPos2D(layer, comp, tt);
            if (!compAnchor) return null;

            // 新親（ヌル）空間へ変換（これで位置アニメが崩れない）
            var np = fromComp2D_expr(newParentLayer, comp, tt, compAnchor[0], compAnchor[1]);
            if (!np) return null;
            return np;
        }

        if (isSep && sp && sp.x && sp.y) {
            if (!isEditable(sp.x) || !isEditable(sp.y)) return { ok:false, reason:"pos_expression_or_locked" };

            var outS = { ok:true, mode:"separated", xKeys:[], yKeys:[], xValue:null, yValue:null };

            try {
                if (sp.x.numKeys && sp.x.numKeys > 0) {
                    for (var kx = 1; kx <= sp.x.numKeys; kx++) {
                        var ttX = sp.x.keyTime(kx);
                        var npX = calcNewPosAtTime(ttX);
                        if (npX) outS.xKeys.push({ k:kx, v:npX[0] });
                    }
                } else {
                    var npX0 = calcNewPosAtTime(comp.time);
                    if (npX0) outS.xValue = npX0[0];
                }

                if (sp.y.numKeys && sp.y.numKeys > 0) {
                    for (var ky = 1; ky <= sp.y.numKeys; ky++) {
                        var ttY = sp.y.keyTime(ky);
                        var npY = calcNewPosAtTime(ttY);
                        if (npY) outS.yKeys.push({ k:ky, v:npY[1] });
                    }
                } else {
                    var npY0 = calcNewPosAtTime(comp.time);
                    if (npY0) outS.yValue = npY0[1];
                }
            } catch (e2) {
                return { ok:false, reason:"build_fail:" + safeErr(e2) };
            }

            return outS;
        }

        var outP = { ok:true, mode:"position", keys:[], value:null };

        try {
            if (pos.numKeys && pos.numKeys > 0) {
                for (var k = 1; k <= pos.numKeys; k++) {
                    var tt = pos.keyTime(k);
                    var np = calcNewPosAtTime(tt);
                    if (!np) continue;

                    var oldv = pos.keyValue(k);
                    if (oldv instanceof Array && oldv.length >= 3) outP.keys.push({ k:k, v:[np[0], np[1], oldv[2]] });
                    else outP.keys.push({ k:k, v:[np[0], np[1]] });
                }
            } else {
                var np0 = calcNewPosAtTime(comp.time);
                if (!np0) return { ok:false, reason:"calc_fail" };
                var v0 = pos.value;
                if (v0 instanceof Array && v0.length >= 3) outP.value = [np0[0], np0[1], v0[2]];
                else outP.value = [np0[0], np0[1]];
            }
        } catch (e3) {
            return { ok:false, reason:"build_fail:" + safeErr(e3) };
        }

        return outP;
    }

    function applyDesiredPositionValues(layer, desired) {
        if (!desired || desired.ok === false) return false;

        var pos = getPositionProp(layer);
        var sp  = getSeparatedPosProps(layer);

        try {
            if (desired.mode === "separated") {
                if (!sp || !sp.x || !sp.y) return false;

                if (desired.xKeys && desired.xKeys.length > 0) {
                    for (var i = 0; i < desired.xKeys.length; i++) sp.x.setValueAtKey(desired.xKeys[i].k, desired.xKeys[i].v);
                } else if (desired.xValue !== null && desired.xValue !== undefined) {
                    sp.x.setValue(desired.xValue);
                }

                if (desired.yKeys && desired.yKeys.length > 0) {
                    for (var j = 0; j < desired.yKeys.length; j++) sp.y.setValueAtKey(desired.yKeys[j].k, desired.yKeys[j].v);
                } else if (desired.yValue !== null && desired.yValue !== undefined) {
                    sp.y.setValue(desired.yValue);
                }

                return true;
            }

            if (desired.mode === "position") {
                if (!pos) return false;

                if (desired.keys && desired.keys.length > 0) {
                    for (var k = 0; k < desired.keys.length; k++) pos.setValueAtKey(desired.keys[k].k, desired.keys[k].v);
                } else if (desired.value) {
                    pos.setValue(desired.value);
                }
                return true;
            }
        } catch (e) {
            return false;
        }

        return false;
    }

    function runParentToPivotNull(comp, layers, pivotKey, optCopyParentRS) {
        var tNow = comp.time;

        // 1) 選択全体のバウンディング → ピボット comp 座標
        var ub = null;
        var diag = [];

        for (var i = 0; i < layers.length; i++) {
            var lyr = layers[i];

            if (!getTransformGroup(lyr) || !getAnchorProp(lyr) || !getPositionProp(lyr)) {
                diag.push("[" + safeName(lyr) + "] skip:no_transform");
                continue;
            }
            if (lyr.locked) { diag.push("[" + safeName(lyr) + "] skip:locked"); continue; }

            var b = null;
            try { b = getLayerBoundsComp2D(lyr, comp, tNow); } catch (eB) { b = null; }

            if (b) {
                ub = unionBounds(ub, b);
                diag.push("[" + safeName(lyr) + "] ok");
            } else {
                var a = getAnchorCompPos2D(lyr, comp, tNow);
                if (!a) diag.push("[" + safeName(lyr) + "] fail:toComp/anchor");
                else diag.push("[" + safeName(lyr) + "] fail:rectCorners");
            }
        }

        if (!ub) {
            var msg = "ヌル作成: bounds_fail\n\n" + diag.join("\n");
            if (msg.length > 2400) msg = msg.substring(0, 2400) + "\n...（省略）";
            alert(msg, SCRIPT_NAME);
            return { ok:false, reason:"bounds_fail" };
        }

        var pivotComp = getPivotFromBounds(ub, pivotKey);
        if (!pivotComp) return { ok:false, reason:"pivot_fail" };

        // 2) 親ごとにグルーピング（親が複数でも破綻しにくくする）
        var groups = {};   // key -> { parent:Layer|null, items:[Layer...] }
        var orderKeys = [];

        function parentKey(p) {
            if (!p) return "p0";
            try {
                if (p.id !== undefined) return "p_" + String(p.id);
            } catch (e) {}
            try {
                return "p_idx_" + String(p.index);
            } catch (ee) {}
            return "p_obj";
        }

        for (var j = 0; j < layers.length; j++) {
            var L = layers[j];
            if (!getTransformGroup(L) || !getAnchorProp(L) || !getPositionProp(L)) continue;
            if (L.locked) continue;

            var p = null;
            try { p = L.parent; } catch (eP) { p = null; }

            var k = parentKey(p);
            if (!groups[k]) {
                groups[k] = { parent: p, items: [] };
                orderKeys.push(k);
            }
            groups[k].items.push(L);
        }

        // 3) 各グループでヌル作成 → 配置 → 位置アニメ崩さず親付け
        var okCount = 0;
        var ng = [];
        var createdNulls = [];

        for (var g = 0; g < orderKeys.length; g++) {
            var key = orderKeys[g];
            var grp = groups[key];
            var parentLayer = grp.parent;
            var items = grp.items;

            if (!items || items.length === 0) continue;

            // ヌル作成
            var add = addPivotNullLayer(comp, "Pivot_NULL");
            if (!add.ok) { ng.push("null_add_fail:" + add.reason); continue; }
            var nullLayer = add.layer;
            createdNulls.push(nullLayer);

            // 既存親がある場合：その子として作成
            if (parentLayer) {
                try { nullLayer.parent = parentLayer; } catch (ePar) {}
                if (optCopyParentRS) copyRotScaleFromParent(parentLayer, nullLayer, tNow);

                // pivotComp を parent 空間へ変換して Position 設定
                var posInParent = calcPosInParentSpace(parentLayer, comp, tNow, pivotComp);
                if (!setPosition2D(nullLayer, posInParent)) {
                    // ダメならとりあえず comp 値直入れ（最終保険）
                    setPosition2D(nullLayer, pivotComp);
                }
            } else {
                if (!setPosition2D(nullLayer, pivotComp)) {
                    ng.push("[" + safeName(nullLayer) + "] null_pos_set_fail");
                }
            }

            // できるだけ選択の先頭より上へ
            try { nullLayer.moveBefore(items[0]); } catch (eMv) {}

            // 親付け前に desired を計算
            var desiredList = [];
            for (var n = 0; n < items.length; n++) {
                var itL = items[n];
                if (itL === nullLayer) continue;

                var desired = buildDesiredPositionValuesForNewParent(itL, comp, nullLayer);
                desiredList.push({
                    layer: itL,
                    desired: desired,
                    ok: (desired && desired.ok !== false),
                    reason: desired ? desired.reason : "build_fail"
                });
            }

            // 適用
            for (var m = 0; m < desiredList.length; m++) {
                var it = desiredList[m];
                var layer = it.layer;

                if (!it.ok) { ng.push("[" + safeName(layer) + "] " + it.reason); continue; }

                try { layer.parent = nullLayer; }
                catch (eP2) { ng.push("[" + safeName(layer) + "] parent_fail:" + safeErr(eP2)); continue; }

                var applied = applyDesiredPositionValues(layer, it.desired);
                if (!applied) {
                    ng.push("[" + safeName(layer) + "] pos_fix_fail");
                    try { layer.parent = null; } catch (eU) {}
                    continue;
                }

                okCount++;
            }
        }

        return { ok:true, okCount:okCount, ng:ng, nulls:createdNulls };
    }

// ---------------- UI ----------------
var __g = $.global;
if (!__g.__SUGI_UI__) __g.__SUGI_UI__ = {};
var __key = "AnchorPivot";

var win = null;

if (thisObj instanceof Panel) {
    win = thisObj;
} else {
    var existing = __g.__SUGI_UI__[__key];
    if (existing && existing instanceof Window) {
        try { existing.show(); } catch (e0) {}
        try { existing.active = true; } catch (e1) {}
        try { existing.toFront(); } catch (e2) {}
        return;
    }

    win = new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
    __g.__SUGI_UI__[__key] = win;

    win.onClose = function () {
        try { __g.__SUGI_UI__[__key] = null; } catch (e) {}
        return true;
    };
}

    win.alignChildren = ["fill", "top"];

    var state = { pivotKey: "C" };

    // Pivot grid panel
    var pnlPivot = win.add("panel", undefined, "ピボット");
    pnlPivot.alignChildren = ["center", "top"];

    var grid = pnlPivot.add("group");
    grid.orientation = "column";
    grid.alignChildren = ["center", "center"];
    grid.spacing = 2;

    var pivotButtons = [];

    function makeGridButton(parent, key, label) {
        var b = parent.add("button", [0, 0, 34, 34], label);
        b._pivotKey = key;
        b.helpTip = key;
        b._baseLabel = label;
        pivotButtons.push(b);
        return b;
    }

    function refreshGridSelection() {
        for (var i = 0; i < pivotButtons.length; i++) {
            var b = pivotButtons[i];
            b.text = (b._pivotKey === state.pivotKey) ? ("[" + b._baseLabel + "]") : (" " + b._baseLabel + " ");
        }
    }

    var r1 = grid.add("group"); r1.spacing = 2;
    makeGridButton(r1, "TL", "↖");
    makeGridButton(r1, "T",  "↑");
    makeGridButton(r1, "TR", "↗");

    var r2 = grid.add("group"); r2.spacing = 2;
    makeGridButton(r2, "L",  "←");
    makeGridButton(r2, "C",  "●");
    makeGridButton(r2, "R",  "→");

    var r3 = grid.add("group"); r3.spacing = 2;
    makeGridButton(r3, "BL", "↙");
    makeGridButton(r3, "B",  "↓");
    makeGridButton(r3, "BR", "↘");

    for (var pb = 0; pb < pivotButtons.length; pb++) {
        pivotButtons[pb].onClick = function () {
            state.pivotKey = this._pivotKey;
            refreshGridSelection();
        };
    }

    var pnlOpt = win.add("panel", undefined, "オプション");
    pnlOpt.alignChildren = ["left", "top"];

    var cbCopyRS = pnlOpt.add("checkbox", undefined, "既存親がある時：親の回転/スケールをヌルへコピー");
    cbCopyRS.value = true;
    cbCopyRS.helpTip = "ONの場合、既存親を持つレイヤーは『親ごとに』ヌルを作成し、その親の回転/スケールをヌルへコピーします。\n階層によっては見た目が変わる可能性があるため、気になる場合はOFFにしてください。";

    var note = pnlOpt.add("statictext", undefined,
        "※選択内に親が複数ある場合は、親ごとにヌルを作ります（Pivot位置は同じ）。");
    try { note.graphics.font = ScriptUI.newFont(note.graphics.font.name, "REGULAR", note.graphics.font.size); } catch(e){}

    var rowExec = win.add("group");
    rowExec.alignChildren = ["fill", "center"];

    var btnMoveAnchor = rowExec.add("button", undefined, "アンカー移動（個別）");
    var btnMakeNull   = rowExec.add("button", undefined, "親ヌル作成（まとめて）");

    // ---------------- Execute: Anchor move ----------------
    btnMoveAnchor.onClick = function () {
    var comp = getActiveComp();
    if (!comp) { alertErr("コンポをアクティブにしてください。"); return; }

    var layers = comp.selectedLayers;
    if (!layers || layers.length === 0) { alertErr("レイヤーを選択してください。"); return; }

    var tNow = comp.time;

    var undoOpened = false;

    try {
        app.beginUndoGroup(SCRIPT_NAME + " - MoveAnchor");
        undoOpened = true;

        var okCount = 0;
        var ng = [];

        for (var i = 0; i < layers.length; i++) {
            var r = processEachLayerMoveAnchor(layers[i], comp, tNow, state.pivotKey);
            if (r.ok) okCount++;
            else ng.push("[" + safeName(layers[i]) + "] " + r.reason);
        }

        if (ng.length > 0) {
            var msg = "完了: " + okCount + " / " + layers.length + "\n\n" +
                      "失敗/スキップ:\n" + ng.join("\n");
            if (msg.length > 2400) msg = msg.substring(0, 2400) + "\n...（省略）";
            alert(msg, SCRIPT_NAME);
        }

    } catch (e) {
        alertErr("エラー: " + safeErr(e));
    } finally {
        // 評価用の隠しレイヤーは残さない
        try { cleanupEvalHelper(); } catch (e1) {}

        if (undoOpened) {
            try { app.endUndoGroup(); } catch (e2) {}
        }
        try { $.gc(); } catch (e3) {}
    }
};


    // ---------------- Execute: Parent to pivot null ----------------
    btnMakeNull.onClick = function () {
    var comp = getActiveComp();
    if (!comp) { alertErr("コンポをアクティブにしてください。"); return; }

    var layers = comp.selectedLayers;
    if (!layers || layers.length === 0) { alertErr("レイヤーを選択してください。"); return; }

    var undoOpened = false;
    var rr = null;

    try {
        app.beginUndoGroup(SCRIPT_NAME + " - PivotNull");
        undoOpened = true;

        rr = runParentToPivotNull(comp, layers, state.pivotKey, cbCopyRS.value === true);

    } catch (e) {
        alertErr("エラー: " + safeErr(e));
    } finally {
        // 評価用の隠しレイヤーは残さない
        try { cleanupEvalHelper(); } catch (e1) {}

        if (undoOpened) {
            try { app.endUndoGroup(); } catch (e2) {}
        }
        try { $.gc(); } catch (e3) {}
    }

    if (!rr || rr.ok !== true) {
        alertErr("失敗: " + (rr ? rr.reason : "unknown"));
        return;
    }

    if (rr.ng && rr.ng.length > 0) {
        var msg2 = "完了: " + rr.okCount + " レイヤー\n\n" +
                   "注意/失敗:\n" + rr.ng.join("\n");
        if (msg2.length > 2400) msg2 = msg2.substring(0, 2400) + "\n...（省略）";
        alert(msg2, SCRIPT_NAME);
    }
};


    refreshGridSelection();

    win.onResizing = win.onResize = function () { this.layout.resize(); };

    if (win instanceof Window) {
        win.center();
        win.show();
    } else {
        win.layout.layout(true);
    }

})(this);
