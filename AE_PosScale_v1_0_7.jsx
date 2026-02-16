﻿/* PosScale v1.0.7
    - Pivot UI: 3x3 grid (visual)
    - "Read" uses selected layers' Position values
    - Execute can apply: Position / Scale / Position&Scale (radio)
    - Move Direction (XY / X / Y / Angle) affects Position scaling; Scale uses XY/X/Y (Angle = uniform)
    - Angle input (deg). 0=Up, 90=Right, -90=Left, 180 or -180=Down
    - Do NOT modify existing keys (adds/updates key only at current time)
    - No completion popup

    - NEW: Even spacing (tracking-like) option for Position (X/Y/Angle)
    - Default: Even spacing checkbox is ON
*/

(function PosScaleUI(thisObj) {

    var SCRIPT_NAME = "PosScale";
    var GLOBAL_KEY = "__AE_PosScale_v1_0_7_UI__";

    if (!(thisObj instanceof Panel)) {
        if (!($.global[GLOBAL_KEY] === undefined || $.global[GLOBAL_KEY] === null)) {
            try {
                $.global[GLOBAL_KEY].show();
                $.global[GLOBAL_KEY].active = true;
            } catch (_reuseErr) {}
            return;
        }
    }

    // ---------------- Utils ----------------
    function isCompItem(item) { return item && (item instanceof CompItem); }

    function getActiveComp() {
        var item = app.project.activeItem;
        if (!isCompItem(item)) return null;
        return item;
    }

    function alertErr(msg) { alert(msg, SCRIPT_NAME); }

    function clamp(v, minV, maxV) { return Math.max(minV, Math.min(maxV, v)); }

    function toFloatSafe(s, fallback) {
        var v = parseFloat(s);
        return isNaN(v) ? fallback : v;
    }

    function fmt2(v) { return Math.round(v * 100) / 100; }

    function safeName(layer) {
        try { return layer.name; } catch (e) { return "(no name)"; }
    }

    // ---------------- Transform / Position ----------------
    function getTransformGroup(layer) {
        if (!layer || !layer.property) return null;
        return layer.property("ADBE Transform Group");
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

    // ---- Scale ----
    function getScaleProp(layer) {
        var tr = getTransformGroup(layer);
        if (!tr) return null;
        return tr.property("ADBE Scale");
    }

    function isScaleEditable(scaleProp) {
        if (!scaleProp) return false;
        if (isExpressionActive(scaleProp)) return false;
        return true;
    }

    function getScaleValueAtTime(layer, t) {
        var sc = getScaleProp(layer);
        if (!sc) return null;
        var v = sc.valueAtTime(t, false);
        if (!v || v.length < 2) return null;

        // 2D: [sx, sy], 3D: [sx, sy, sz]
        if (v.length >= 3) return [v[0], v[1], v[2]];
        return [v[0], v[1]];
    }

    // Position separation detection (AE uses dimensionsSeparated / isSeparationLeader depending on version)
    function isPosSeparated(posProp) {
        if (!posProp) return false;
        try {
            if (typeof posProp.dimensionsSeparated === "boolean") return posProp.dimensionsSeparated;
        } catch (e) {}
        try {
            if (typeof posProp.isSeparationLeader === "boolean") return posProp.isSeparationLeader;
        } catch (e) {}
        return false;
    }

    function isExpressionActive(prop) {
        if (!prop) return false;
        try {
            if (prop.canSetExpression && prop.expressionEnabled) return true;
        } catch (e) {}
        return false;
    }

    function is3DLayer(layer) {
        try { return layer && layer.threeDLayer === true; } catch (e) { return false; }
    }


    function isPositionEditable(posProp) {
        if (!posProp) return false;
        if (isExpressionActive(posProp)) return false;
        return true;
    }

    function getPosValueAtTime(layer, t) {
        var pos = getPositionProp(layer);
        if (!pos) return null;

        if (!isPosSeparated(pos)) {
            var v = pos.valueAtTime(t, false);
            if (!v || v.length < 2) return null;
            if (v.length >= 3) return [v[0], v[1], v[2]];
            return [v[0], v[1], 0];
        }

        var sp = getSeparatedPosProps(layer);
        if (!sp || !sp.x || !sp.y) return null;

        var x = sp.x.valueAtTime(t, false);
        var y = sp.y.valueAtTime(t, false);
        var z = 0;
        if (is3DLayer(layer) && sp.z) {
            z = sp.z.valueAtTime(t, false);
        }

        return [x, y, z];
    }

    // ---------------- Bounds from Position ----------------
    function computeSelectionPosBounds(comp, layers, time) {
        var minX = null, maxX = null, minY = null, maxY = null;
        var leftLayer = null, rightLayer = null, topLayer = null, bottomLayer = null;
        var validCount = 0;

        for (var i = 0; i < layers.length; i++) {
            var ly = layers[i];
            if (!getTransformGroup(ly)) continue;

            var p = getPosValueAtTime(ly, time);
            if (!p) continue;

            var x = p[0], y = p[1];

            if (minX === null) {
                minX = maxX = x;
                minY = maxY = y;
                leftLayer = rightLayer = topLayer = bottomLayer = ly;
            } else {
                if (x < minX) { minX = x; leftLayer = ly; }
                if (x > maxX) { maxX = x; rightLayer = ly; }
                if (y < minY) { minY = y; topLayer = ly; }     // 上=小さいY
                if (y > maxY) { maxY = y; bottomLayer = ly; }  // 下=大きいY
            }

            validCount++;
        }

        if (validCount === 0 || minX === null) return null;

        return {
            minX: minX, maxX: maxX,
            minY: minY, maxY: maxY,
            cx: (minX + maxX) / 2.0,
            cy: (minY + maxY) / 2.0,
            leftLayer: leftLayer,
            rightLayer: rightLayer,
            topLayer: topLayer,
            bottomLayer: bottomLayer
        };
    }

    function getPivotFromBounds(bounds, pivotKey) {
        if (!bounds) return null;

        var xL = bounds.minX, xC = bounds.cx, xR = bounds.maxX;
        var yT = bounds.minY, yC = bounds.cy, yB = bounds.maxY;

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

    // mode: "XY" / "X" / "Y" / "ANG"
    function computeScaledPos(pos3, pivot, factor, mode, angleDeg) {
        var x = pos3[0], y = pos3[1];
        var vx = x - pivot[0];
        var vy = y - pivot[1];

        var sx = vx;
        var sy = vy;

        if (mode === "XY") {
            sx = vx * factor;
            sy = vy * factor;
        } else if (mode === "X") {
            sx = vx * factor;
            sy = vy;
        } else if (mode === "Y") {
            sx = vx;
            sy = vy * factor;
        } else if (mode === "ANG") {
            // Angle axis only: scale the component along the angle direction
            // AE coords: +X right, +Y down
            // 角度基準: 0=上, 90=右, -90=左, 180/-180=下
            var rad = (angleDeg - 90) * Math.PI / 180.0;
            var ux = Math.cos(rad);
            var uy = Math.sin(rad);

            var dot = vx * ux + vy * uy;         // parallel length
            var parx = dot * ux;
            var pary = dot * uy;

            var perpx = vx - parx;
            var perpy = vy - pary;

            sx = perpx + parx * factor;
            sy = perpy + pary * factor;
        }

        return [pivot[0] + sx, pivot[1] + sy, pos3[2]];
    }

    // ---------------- Apply (Key-safe) ----------------
    // Existing keys are NOT modified. Only sets value at current time (adds/updates key there).
    function applyPositionAtCurrentTime(layer, time, pivot, factor, mode, angleDeg) {
        if (!layer || layer.locked) return { ok: false, reason: "locked" };
        if (!getTransformGroup(layer)) return { ok: false, reason: "invalid" };

        var pos = getPositionProp(layer);
        if (!pos) return { ok: false, reason: "no_position" };
        if (!isPositionEditable(pos)) return { ok: false, reason: "expression" };

        var cur = getPosValueAtTime(layer, time);
        if (!cur) return { ok: false, reason: "no_value" };

        var new3 = computeScaledPos(cur, pivot, factor, mode, angleDeg);

        // Non-separated: keep dimension (2D vs 3D)
        if (!isPosSeparated(pos)) {
            var curV = pos.valueAtTime(time, false);
            if (curV && curV.length >= 3) {
                pos.setValueAtTime(time, [new3[0], new3[1], new3[2]]);
            } else {
                pos.setValueAtTime(time, [new3[0], new3[1]]);
            }
            return { ok: true };
        }

        // Separated: set only at time
        var sp = getSeparatedPosProps(layer);
        if (!sp || !sp.x || !sp.y) return { ok: false, reason: "separated_missing" };

        try {
            if (sp.x.expressionEnabled || sp.y.expressionEnabled || (sp.z && sp.z.expressionEnabled)) {
                return { ok: false, reason: "expression" };
            }
        } catch (e) {}

        try {
            sp.x.setValueAtTime(time, new3[0]);
            sp.y.setValueAtTime(time, new3[1]);
            if (is3DLayer(layer) && sp.z) {
                sp.z.setValueAtTime(time, new3[2]);
            }
        } catch (e2) {
            return { ok: false, reason: "set_fail", error: String(e2) };
        }

        return { ok: true };
    }

    
    // ---------------- Even spacing (Tracking-like) ----------------
    // Distribute layers evenly along X / Y / ANG axis based on visual bounds (sourceRectAtTime + toComp).
    // Keeps the group's chosen pivot (Left/Center/Right) in place by pivotKey.
    // Adds/updates key only at current time (same policy as applyPositionAtCurrentTime).
    function applyEvenSpacingAtCurrentTime(layers, time, factor, mode, angleDeg, pivotKey) {
        var failed = [];

        if (!layers || layers.length === 0) return { ok: true, failed: failed };

        // Axis unit vector
        var ux = 1, uy = 0;
        if (mode === "X") { ux = 1; uy = 0; }
        else if (mode === "Y") { ux = 0; uy = 1; }
        else if (mode === "ANG") {
            var rad = angleDeg * Math.PI / 180.0;
            ux = Math.cos(rad);
            uy = Math.sin(rad);
        } else {
            // XY is not defined for even spacing (fallback)
            return { ok: false, reason: "unsupported_mode", failed: failed };
        }

        // Pivot kind from pivotKey (use Left / Center / Right only)
        var pivotKind = "C";
        if (pivotKey === "L" || pivotKey === "TL" || pivotKey === "BL") pivotKind = "L";
        else if (pivotKey === "R" || pivotKey === "TR" || pivotKey === "BR") pivotKind = "R";

        // Collect entries with projected bounds along axis
        var entries = [];
        for (var i = 0; i < layers.length; i++) {
            var ly = layers[i];
            if (!ly || ly.locked) {
                failed.push({ layer: ly, kind: "pos", res: { ok: false, reason: "locked" } });
                continue;
            }
            if (!getTransformGroup(ly)) {
                failed.push({ layer: ly, kind: "pos", res: { ok: false, reason: "invalid" } });
                continue;
            }

            var pos = getPositionProp(ly);
            if (!pos) {
                failed.push({ layer: ly, kind: "pos", res: { ok: false, reason: "no_position" } });
                continue;
            }
            if (!isPositionEditable(pos)) {
                failed.push({ layer: ly, kind: "pos", res: { ok: false, reason: "expression" } });
                continue;
            }

            // Anchor comp position (used to translate layer by delta)
            var anch = null;
            try {
                anch = ly.toComp([0, 0, 0]);
            } catch (eA) {
                // fallback to Position value (works for most 2D unparented cases)
                try {
                    var pv = getPosValueAtTime(ly, time);
                    anch = pv ? [pv[0], pv[1], (pv.length > 2 ? pv[2] : 0)] : [0, 0, 0];
                } catch (eA2) {
                    anch = [0, 0, 0];
                }
            }
            if (!anch) anch = [0, 0, 0];
            var az = (anch.length > 2) ? anch[2] : 0;

            // Visual bounds in layer space
            var rect = null;
            try {
                rect = ly.sourceRectAtTime(time, false);
            } catch (eR) {
                rect = null;
            }

            // If no rect, treat as a point (extent=0)
            var minS = null, maxS = null;
            if (!rect) {
                var s0 = (anch[0] * ux + anch[1] * uy);
                minS = s0; maxS = s0;
            } else {
                var l = rect.left;
                var t = rect.top;
                var w = rect.width;
                var h = rect.height;

                // 4 corners -> comp -> projection
                var pts = [
                    [l,     t,     0],
                    [l + w, t,     0],
                    [l,     t + h, 0],
                    [l + w, t + h, 0]
                ];

                minS =  1e50;
                maxS = -1e50;
                for (var p = 0; p < pts.length; p++) {
                    var cp = null;
                    try {
                        cp = ly.toComp(pts[p]);
                    } catch (eC) {
                        cp = null;
                    }
                    if (!cp) continue;
                    var sx = cp[0];
                    var sy = cp[1];
                    var proj = sx * ux + sy * uy;
                    if (proj < minS) minS = proj;
                    if (proj > maxS) maxS = proj;
                }

                // If toComp failed on all points, fallback to anchor point
                if (minS === 1e50 || maxS === -1e50) {
                    var s1 = (anch[0] * ux + anch[1] * uy);
                    minS = s1; maxS = s1;
                }
            }

            var extent = maxS - minS;
            var centerS = (minS + maxS) / 2.0;

            entries.push({
                layer: ly,
                posProp: pos,
                minS: minS,
                maxS: maxS,
                extent: extent,
                centerS: centerS,
                anchorComp: [anch[0], anch[1], az]
            });
        }

        if (entries.length <= 1) return { ok: true, failed: failed };

        // Sort by axis position (left->right along axis)
        entries.sort(function (a, b) { return a.centerS - b.centerS; });

        // Group span
        var groupMin =  1e50;
        var groupMax = -1e50;
        var sumExt = 0;
        for (var k = 0; k < entries.length; k++) {
            if (entries[k].minS < groupMin) groupMin = entries[k].minS;
            if (entries[k].maxS > groupMax) groupMax = entries[k].maxS;
            sumExt += entries[k].extent;
        }
        if (groupMin === 1e50 || groupMax === -1e50) return { ok: true, failed: failed };

        var curSpan = groupMax - groupMin;
        var newSpan = curSpan * factor;

        var n = entries.length;
        var gap = (n > 1) ? ((newSpan - sumExt) / (n - 1)) : 0;

        // Left edge of new arrangement depending on pivot kind
        var pivotS = (pivotKind === "L") ? groupMin : (pivotKind === "R" ? groupMax : ((groupMin + groupMax) / 2.0));
        var leftEdge = (pivotKind === "L") ? pivotS : (pivotKind === "R" ? (pivotS - newSpan) : (pivotS - newSpan / 2.0));

        // Apply translation per layer
        var cursor = leftEdge;
        for (var ii = 0; ii < entries.length; ii++) {
            var e = entries[ii];

            var desiredMin = cursor;
            var desiredMax = cursor + e.extent;
            var desiredCenter = (desiredMin + desiredMax) / 2.0;

            var deltaS = desiredCenter - e.centerS;

            var dx = ux * deltaS;
            var dy = uy * deltaS;

            // Target anchor comp position
            var targetAnchorComp = [e.anchorComp[0] + dx, e.anchorComp[1] + dy, e.anchorComp[2]];

            // Convert to Position value (parent space if parent exists)
            var targetPos = null;
            if (e.layer.parent) {
                try {
                    var pp = e.layer.parent.fromComp(targetAnchorComp);
                    targetPos = pp;
                } catch (ePC) {
                    targetPos = null;
                }
            }
            if (!targetPos) {
                targetPos = [targetAnchorComp[0], targetAnchorComp[1], targetAnchorComp[2]];
            }

            // Preserve Z if 3D (we don't move in Z)
            var curV = null;
            try { curV = e.posProp.valueAtTime(time, false); } catch (eCV) { curV = null; }
            var curZ = (curV && curV.length >= 3) ? curV[2] : 0;
            if (is3DLayer(e.layer)) {
                if (targetPos.length < 3) targetPos = [targetPos[0], targetPos[1], curZ];
                else targetPos[2] = curZ;
            }

            try {
                if (!isPosSeparated(e.posProp)) {
                    if (is3DLayer(e.layer)) {
                        e.posProp.setValueAtTime(time, [targetPos[0], targetPos[1], targetPos[2]]);
                    } else {
                        e.posProp.setValueAtTime(time, [targetPos[0], targetPos[1]]);
                    }
                } else {
                    var sp = getSeparatedPosProps(e.layer);
                    sp.x.setValueAtTime(time, targetPos[0]);
                    sp.y.setValueAtTime(time, targetPos[1]);
                    if (is3DLayer(e.layer) && sp.z) {
                        sp.z.setValueAtTime(time, targetPos[2]);
                    }
                }
            } catch (eSet) {
                failed.push({ layer: e.layer, kind: "pos", res: { ok: false, reason: "set_fail", error: String(eSet) } });
            }

            cursor += e.extent + gap;
        }

        return { ok: true, failed: failed };
    }


function applyScaleAtCurrentTime(layer, time, factor, mode) {
        if (!layer || layer.locked) return { ok: false, reason: "locked" };
        if (!getTransformGroup(layer)) return { ok: false, reason: "invalid" };

        var sc = getScaleProp(layer);
        if (!sc) return { ok: false, reason: "no_scale" };
        if (!isScaleEditable(sc)) return { ok: false, reason: "expression" };

        var cur = getScaleValueAtTime(layer, time);
        if (!cur) return { ok: false, reason: "no_value" };

        var newV;

        // Note:
        // mode "ANG" is meaningful for Position only.
        // For Scale, "ANG" is treated as uniform (same as "XY").
        var m = (mode === "ANG") ? "XY" : mode;

        if (cur.length >= 3) {
            var sx3 = cur[0], sy3 = cur[1], sz3 = cur[2];

            if (m === "X") {
                sx3 = sx3 * factor;
            } else if (m === "Y") {
                sy3 = sy3 * factor;
            } else { // XY
                sx3 = sx3 * factor;
                sy3 = sy3 * factor;
                sz3 = sz3 * factor;
            }
            newV = [sx3, sy3, sz3];
        } else {
            var sx2 = cur[0], sy2 = cur[1];

            if (m === "X") {
                sx2 = sx2 * factor;
            } else if (m === "Y") {
                sy2 = sy2 * factor;
            } else { // XY
                sx2 = sx2 * factor;
                sy2 = sy2 * factor;
            }
            newV = [sx2, sy2];
        }

        try {
            sc.setValueAtTime(time, newV);
        } catch (e) {
            return { ok: false, reason: "set_fail", error: String(e) };
        }

        return { ok: true };
    }

    // ---------------- UI ----------------
    var win = (thisObj instanceof Panel)
        ? thisObj
        : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

    if (win instanceof Window) {
        $.global[GLOBAL_KEY] = win;
        win.onClose = function () {
            try { $.global[GLOBAL_KEY] = null; } catch (_closeErr) {}
        };
    }

    win.alignChildren = ["fill", "top"];

    var state = {
        bounds: null,
        pivotKey: "C",
        applyTarget: "POS", // POS / SCL / BOTH
        mode: "XY",
        angleDeg: 0,
        evenSpacing: true
    };

    // Read row
    var rowRead = win.add("group");
    rowRead.alignChildren = ["left", "center"];
    rowRead.add("statictext", undefined, "① 位置端を読み込み（Position値）:");
    var btnRead = rowRead.add("button", undefined, "位置を読み込み");

    // Info
    var info = win.add("statictext", undefined, "未読み込み（レイヤーを選んで「位置を読み込み」）", { multiline: true });
    info.minimumSize.height = 78;

    function setInfoFromBounds(b) {
        if (!b) {
            info.text = "未読み込み（レイヤーを選んで「位置を読み込み」）";
            return;
        }
        info.text =
            "読み込み済み（Position値の端）:\n" +
            "Left=" + fmt2(b.minX) + "  [" + safeName(b.leftLayer) + "]\n" +
            "Right=" + fmt2(b.maxX) + "  [" + safeName(b.rightLayer) + "]\n" +
            "Top=" + fmt2(b.minY) + "  [" + safeName(b.topLayer) + "]\n" +
            "Bottom=" + fmt2(b.maxY) + "  [" + safeName(b.bottomLayer) + "]\n" +
            "Center=(" + fmt2(b.cx) + ", " + fmt2(b.cy) + ")";
    }

    // Pivot grid
    var pnlPivot = win.add("panel", undefined, "② ピボット（3×3）");
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


    // Target (Position / Scale / Position & Scale)
    var pnlTarget = win.add("panel", undefined, "③ 対象");
    pnlTarget.alignChildren = ["left", "top"];

    var gTarget = pnlTarget.add("group");
    gTarget.alignChildren = ["left", "center"];

    var rbTargetPos  = gTarget.add("radiobutton", undefined, "位置");
    var rbTargetScl  = gTarget.add("radiobutton", undefined, "スケール");
    var rbTargetBoth = gTarget.add("radiobutton", undefined, "位置＆スケール");

    rbTargetPos.value = true;

    function updateTargetFromUI() {
        if (rbTargetScl.value) state.applyTarget = "SCL";
        else if (rbTargetBoth.value) state.applyTarget = "BOTH";
        else state.applyTarget = "POS";
    }

    rbTargetPos.onClick = rbTargetScl.onClick = rbTargetBoth.onClick = function () { updateTargetFromUI(); };
    updateTargetFromUI();

    // Direction / Angle
    var pnlDir = win.add("panel", undefined, "④ 移動方向");
    pnlDir.alignChildren = ["left", "top"];

    var gDir = pnlDir.add("group");
    gDir.alignChildren = ["left", "center"];

    var rbXY = gDir.add("radiobutton", undefined, "XY");
    var rbX  = gDir.add("radiobutton", undefined, "Xのみ");
    var rbY  = gDir.add("radiobutton", undefined, "Yのみ");
    var rbA  = gDir.add("radiobutton", undefined, "角度");

    rbXY.value = true;

    var gAng = pnlDir.add("group");
    gAng.alignChildren = ["left", "center"];
    var stAng = gAng.add("statictext", undefined, "角度(°):");
    var edtAng = gAng.add("edittext", undefined, "0");
    edtAng.characters = 6;
    var sldAng = gAng.add("slider", undefined, 0, -180, 180);
    sldAng.preferredSize.width = 220;

    var stAngHint = pnlDir.add("statictext", undefined, "※ 0=上, 90=右, -90=左, 180/-180=下", { multiline: false });

    function enableAngleUI(on) {
        stAng.enabled = on;
        edtAng.enabled = on;
        sldAng.enabled = on;
        stAngHint.enabled = on;
    }
    enableAngleUI(false);

    function syncAngleToSlider() {
        var v = clamp(toFloatSafe(edtAng.text, 0), -180, 180);
        edtAng.text = String(v);
        sldAng.value = v;
        state.angleDeg = v;
    }

    function syncSliderToAngle() {
        var v = Math.round(sldAng.value);
        edtAng.text = String(v);
        state.angleDeg = v;
    }

    edtAng.onChange = function () { syncAngleToSlider(); };
    sldAng.onChanging = function () { syncSliderToAngle(); };

    // Even spacing (tracking-like) for Position
    var chkEven = pnlDir.add("checkbox", undefined, "字送り風（均等間隔）");
    chkEven.value = true;
    chkEven.helpTip = "Position適用時のみ。X/Y/角度モードで、端(見た目の幅)基準の均等間隔に並べ直します。文字(1文字1レイヤー)におすすめ。";
    chkEven.onClick = function () { state.evenSpacing = chkEven.value; };


    function updateModeFromUI() {
        if (rbX.value) state.mode = "X";
        else if (rbY.value) state.mode = "Y";
        else if (rbA.value) state.mode = "ANG";
        else state.mode = "XY";

        enableAngleUI(state.mode === "ANG");
        if (state.mode === "ANG") syncAngleToSlider();
    }

    rbXY.onClick = rbX.onClick = rbY.onClick = rbA.onClick = function () { updateModeFromUI(); };

    // Percent + slider
    var pnlPct = win.add("panel", undefined, "⑤ 変化率（%）");
    pnlPct.alignChildren = ["fill", "top"];

    var gPct = pnlPct.add("group");
    gPct.alignChildren = ["left", "center"];

    gPct.add("statictext", undefined, "％：");
    var edtPct = gPct.add("edittext", undefined, "100");
    edtPct.characters = 6;

    var sldPct = gPct.add("slider", undefined, 100, 0, 3000);
    sldPct.preferredSize.width = 220;

    pnlPct.add("statictext", undefined, "0〜3000（100=変更なし）");

    function syncPctToSlider() {
        var v = clamp(toFloatSafe(edtPct.text, 100), 0, 3000);
        edtPct.text = String(v);
        sldPct.value = v;
    }

    function syncSliderToPct() {
        var v = Math.round(sldPct.value);
        edtPct.text = String(v);
    }

    edtPct.onChange = function () { syncPctToSlider(); };
    sldPct.onChanging = function () { syncSliderToPct(); };

    // Execute
    var rowExec = win.add("group");
    rowExec.alignChildren = ["right", "center"];
    var btnExec = rowExec.add("button", undefined, "実行（現在フレームにキー）");

    // ---------------- Handlers ----------------
    btnRead.onClick = function () {
        var comp = getActiveComp();
        if (!comp) { alertErr("コンポをアクティブにしてください。"); return; }

        var layers = comp.selectedLayers;
        if (!layers || layers.length === 0) { alertErr("レイヤーを選択してください。"); return; }

        var b = computeSelectionPosBounds(comp, layers, comp.time);
        if (!b) { alertErr("位置端の計算に失敗しました（Positionが取得できないレイヤーのみ選択の可能性）。"); return; }

        state.bounds = b;
        setInfoFromBounds(b);
    };

    btnExec.onClick = function () {
        var comp = getActiveComp();
        if (!comp) { alertErr("コンポをアクティブにしてください。"); return; }

        var layers = comp.selectedLayers;
        if (!layers || layers.length === 0) { alertErr("レイヤーを選択してください。"); return; }

        updateModeFromUI();
        updateTargetFromUI();
        syncPctToSlider();

        var pct = toFloatSafe(edtPct.text, 100);
        var factor = pct / 100.0;

        var pivot = null;

        if (state.applyTarget === "POS" || state.applyTarget === "BOTH") {
            if (!state.bounds) {
                var b2 = computeSelectionPosBounds(comp, layers, comp.time);
                if (!b2) { alertErr("位置端の計算に失敗しました。"); return; }
                state.bounds = b2;
                setInfoFromBounds(b2);
            }

            pivot = getPivotFromBounds(state.bounds, state.pivotKey);
            if (!pivot) { alertErr("ピボット取得に失敗しました。"); return; }
        }

        var t = comp.time;

        app.beginUndoGroup(SCRIPT_NAME);
        try {
            var failed = [];

        // 字送り風（均等間隔）：Positionはレイヤー群をまとめて再配置（X/Y/角度のみ）
        if ((state.applyTarget === "POS" || state.applyTarget === "BOTH") &&
            state.evenSpacing &&
            (state.mode === "X" || state.mode === "Y" || state.mode === "ANG")) {

            var rEven = applyEvenSpacingAtCurrentTime(layers, t, factor, state.mode, state.angleDeg, state.pivotKey);
            if (rEven && rEven.failed && rEven.failed.length > 0) {
                for (var fe = 0; fe < rEven.failed.length; fe++) {
                    failed.push(rEven.failed[fe]);
                }
            }

            // Scale（必要なら）だけは従来どおり個別適用
            if (state.applyTarget === "SCL" || state.applyTarget === "BOTH") {
                for (var i = 0; i < layers.length; i++) {
                    var ly = layers[i];
                    var rScl = applyScaleAtCurrentTime(ly, t, factor, state.mode);
                    if (!rScl || rScl.ok !== true) {
                        failed.push({ layer: ly, kind: "scale", res: rScl });
                    }
                }
            }
        } else {
            for (var i = 0; i < layers.length; i++) {
                var ly = layers[i];

                // 既存キーは変更しない。現在フレームの setValueAtTime のみ。
                if (state.applyTarget === "POS" || state.applyTarget === "BOTH") {
                    var rPos = applyPositionAtCurrentTime(ly, t, pivot, factor, state.mode, state.angleDeg);
                    if (!rPos || rPos.ok !== true) {
                        failed.push({ layer: ly, kind: "pos", res: rPos });
                    }
                }

                if (state.applyTarget === "SCL" || state.applyTarget === "BOTH") {
                    var rScl2 = applyScaleAtCurrentTime(ly, t, factor, state.mode);
                    if (!rScl2 || rScl2.ok !== true) {
                        failed.push({ layer: ly, kind: "scale", res: rScl2 });
                    }
                }
            }
        }

            // 完了ポップアップは出さない（要求により）
            // ただし、失敗があればエラー内容だけ通知
            if (failed.length > 0) {
                var msg = "適用できなかったレイヤーがあります。\n";
                var showN = Math.min(10, failed.length);
                for (var j = 0; j < showN; j++) {
                    var rr = failed[j].res;
                    var kind = failed[j].kind ? (failed[j].kind + " ") : "";
                    var reason = (rr && rr.reason) ? rr.reason : "unknown";
                    var err = (rr && rr.error) ? (" / " + rr.error) : "";
                    msg += "- " + safeName(failed[j].layer) + " : " + kind + reason + err + "\n";
                }
                if (failed.length > showN) {
                    msg += "... (" + failed.length + "件)\n";
                }
                alertErr(msg);
            }
        } finally {
            app.endUndoGroup();
        }
    };

    // layout
    refreshGridSelection();
    setInfoFromBounds(state.bounds);
    updateModeFromUI();

    win.onResizing = win.onResize = function () { this.layout.resize(); };

    if (win instanceof Window) {
        win.center();
        win.show();
    } else {
        win.layout.layout(true);
    }

})(this);
