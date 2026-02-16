/* Ratio Rect Maker.jsx
   - Rect/Solid creation + update selected rect size
   - Sortable size list
   - Guide generation:
       * Guide Type: Spiral / Split Lines
       * Fit: Contain (inside) / Cover (overshoot)
       * Anchor: TL/TR/BL/BR/Center
       * Per-ratio "valid ratio-rectangle" is drawn + guide inside it (no stretch)
*/

#target aftereffects

(function RatioRectMaker(thisObj) {

    // -----------------------------
    // Utilities
    // -----------------------------
    function isComp(item) { return (item && (item instanceof CompItem)); }

    function clampMinInt(v, minV) {
        v = Math.round(v);
        if (isNaN(v) || !isFinite(v)) return minV;
        return Math.max(minV, v);
    }

    function parsePositiveInt(str, fallback) {
        var n = parseInt(str, 10);
        if (isNaN(n) || !isFinite(n) || n <= 0) return fallback;
        return n;
    }

    function calcMaxRect(baseW, baseH, ratioWH) {
        // maximal rect inside base (contain)
        var baseAspect = baseW / baseH;
        var w, h, limit;
        if (baseAspect >= ratioWH) {
            h = baseH; w = ratioWH * h; limit = "height";
        } else {
            w = baseW; h = w / ratioWH; limit = "width";
        }
        return { w: w, h: h, limit: limit };
    }

    function calcCoverRect(baseW, baseH, ratioWH) {
        // minimal rect that covers base (cover)
        var baseAspect = baseW / baseH;
        var w, h, limit;
        if (baseAspect >= ratioWH) {
            w = baseW; h = w / ratioWH; limit = "width";
        } else {
            h = baseH; w = ratioWH * h; limit = "height";
        }
        return { w: w, h: h, limit: limit };
    }

    function fitRectByMode(baseW, baseH, ratioWH, fitModeText) {
        // fitModeText: "内接（正確）" or "外接（正確・見切れ）"
        if (fitModeText === "外接（正確・見切れ）") return calcCoverRect(baseW, baseH, ratioWH);
        return calcMaxRect(baseW, baseH, ratioWH);
    }

    function getStageDesc(scalesLen, stageIndex, orientationLabel) {
        if (scalesLen === 5) {
            if (stageIndex === 1) return "扱いやすい“王道”";
            if (stageIndex === 2) return (orientationLabel === "横長") ? "余白多めで上品" : "余白多めで綺麗";
            if (stageIndex === 3) return (orientationLabel === "横長") ? "中サイズ、文字背景にも◎" : "中サイズ";
            if (stageIndex === 4) return "小さめ";
        } else if (scalesLen === 4) {
            if (stageIndex === 1) return "扱いやすい“王道”";
            if (stageIndex === 2) return "余白多め";
            if (stageIndex === 3) return "小さめ";
        } else if (scalesLen === 3) {
            if (stageIndex === 1) return "扱いやすい“王道”";
            if (stageIndex === 2) return "余白多め";
        }
        return "サイズ" + (stageIndex + 1);
    }

    function orientationSortKey(orientation) { return (orientation === "横長") ? 0 : 1; }

    function getInsertionLayer(comp) {
        var sel = comp.selectedLayers;
        if (!sel || sel.length === 0) return null;
        var best = sel[0];
        for (var i = 1; i < sel.length; i++) if (sel[i].index > best.index) best = sel[i];
        return best;
    }

    function createShapeRect(comp, w, h, name) {
        var shapeLayer = comp.layers.addShape();
        shapeLayer.name = name;

        var contents = shapeLayer.property("Contents");
        var group = contents.addProperty("ADBE Vector Group");
        group.name = "Rect";

        var groupContents = group.property("Contents");
        var rect = groupContents.addProperty("ADBE Vector Shape - Rect");
        rect.property("Size").setValue([w, h]);
        rect.property("Position").setValue([0, 0]);

        var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("Color").setValue([1, 1, 1]);
        fill.property("Opacity").setValue(100);

        shapeLayer.property("Transform").property("Position").setValue([comp.width / 2, comp.height / 2]);
        return shapeLayer;
    }

    function createSolidRect(comp, w, h, name) {
        var solid = comp.layers.addSolid([1, 1, 1], name, w, h, comp.pixelAspect, comp.duration);
        solid.property("Transform").property("Position").setValue([comp.width / 2, comp.height / 2]);
        return solid;
    }

    function findFirstRectSizeProp(propGroup) {
        if (!propGroup || typeof propGroup.numProperties !== "number") return null;
        for (var i = 1; i <= propGroup.numProperties; i++) {
            var p = propGroup.property(i);
            if (!p) continue;
            try {
                if (p.matchName === "ADBE Vector Shape - Rect") {
                    var sizeProp = p.property("Size");
                    if (sizeProp) return sizeProp;
                }
                if (p.propertyType === PropertyType.INDEXED_GROUP || p.propertyType === PropertyType.NAMED_GROUP) {
                    var found = findFirstRectSizeProp(p);
                    if (found) return found;
                }
            } catch (e) {}
        }
        return null;
    }

    // -----------------------------
    // Ratios
    // -----------------------------
    var PHI    = (1 + Math.sqrt(5)) / 2;                 // 1.618...
    var SQRT2  = Math.sqrt(2);                           // 1.414...
    var SILVER = 1 + Math.sqrt(2);                       // 2.414...
    var BRONZE = (3 + Math.sqrt(13)) / 2;                // 3.302...
    var COPPER = 2 + Math.sqrt(5);                       // 4.236...
    var NICKEL = (5 + Math.sqrt(29)) / 2;                // 5.192...

    // scales
    var SCALES_5      = [1.0, 0.9, 0.8, 0.7, (584 / 1080)];
    var SCALES_4_WIDE = [1.0, (5 / 6), (2 / 3), 0.5];
    var SCALES_3_WIDE = [1.0, (5 / 6), (2 / 3)];
    var SCALES_4_TALL = [1.0, (8 / 9), (20 / 27), (16 / 27)];
    var SCALES_4_23   = [1.0, (8 / 9), (3 / 4), (2 / 3)];
    var SCALES_3_34   = [1.0, (8 / 9), (20 / 27)];

    var RATIO_GROUP_ORDER = [
        "黄金比","白銀比","銀比","青銅比","銅比","ニッケル比",
        "2:1","3:1","21:9","9:16","2:3","3:4"
    ];

    function getRatioGroupIndex(name) {
        for (var i = 0; i < RATIO_GROUP_ORDER.length; i++) if (RATIO_GROUP_ORDER[i] === name) return i;
        return 999;
    }

    var VARIANTS = [
        { key:"gold_h", name:"黄金比", orientation:"横長", ratioWH: PHI,      scales:SCALES_5 },
        { key:"gold_v", name:"黄金比", orientation:"縦長", ratioWH: 1/PHI,    scales:SCALES_5 },

        { key:"ws_h",   name:"白銀比", orientation:"横長", ratioWH: SQRT2,    scales:SCALES_5 },
        { key:"ws_v",   name:"白銀比", orientation:"縦長", ratioWH: 1/SQRT2,  scales:SCALES_5 },

        { key:"sil_h",  name:"銀比",   orientation:"横長", ratioWH: SILVER,   scales:SCALES_5 },
        { key:"sil_v",  name:"銀比",   orientation:"縦長", ratioWH: 1/SILVER, scales:SCALES_5 },

        { key:"bro_h",  name:"青銅比", orientation:"横長", ratioWH: BRONZE,   scales:SCALES_5 },
        { key:"bro_v",  name:"青銅比", orientation:"縦長", ratioWH: 1/BRONZE, scales:SCALES_5 },

        { key:"cop_h",  name:"銅比",   orientation:"横長", ratioWH: COPPER,   scales:SCALES_5 },
        { key:"cop_v",  name:"銅比",   orientation:"縦長", ratioWH: 1/COPPER, scales:SCALES_5 },

        { key:"nic_h",  name:"ニッケル比", orientation:"横長", ratioWH: NICKEL,   scales:SCALES_5 },
        { key:"nic_v",  name:"ニッケル比", orientation:"縦長", ratioWH: 1/NICKEL, scales:SCALES_5 },

        { key:"2_1_h",  name:"2:1",  orientation:"横長", ratioWH:2.0,       scales:SCALES_4_WIDE },
        { key:"3_1_h",  name:"3:1",  orientation:"横長", ratioWH:3.0,       scales:SCALES_3_WIDE },
        { key:"21_9_h", name:"21:9", orientation:"横長", ratioWH:(21/9),    scales:SCALES_3_WIDE },

        { key:"9_16_v", name:"9:16", orientation:"縦長", ratioWH:(9/16),    scales:SCALES_4_TALL },
        { key:"2_3_v",  name:"2:3",  orientation:"縦長", ratioWH:(2/3),     scales:SCALES_4_23 },
        { key:"3_4_v",  name:"3:4",  orientation:"縦長", ratioWH:(3/4),     scales:SCALES_3_34 }
    ];

    // -----------------------------
    // Guide helpers
    // -----------------------------
    function addStroke(groupContents, widthVal, opacityVal) {
        var stroke = groupContents.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("Color").setValue([1, 1, 1]);
        stroke.property("Stroke Width").setValue(widthVal);
        stroke.property("Opacity").setValue(opacityVal);
        return stroke;
    }

    function addBBoxGroup(contents, w, h) {
        var g = contents.addProperty("ADBE Vector Group");
        g.name = "BBox";

        var gc = g.property("Contents");
        var rect = gc.addProperty("ADBE Vector Shape - Rect");
        rect.property("Size").setValue([w, h]);
        rect.property("Position").setValue([0, 0]);

        addStroke(gc, 2, 45);
        return g;
    }

    function addRatioRectOutline(gc, w, h, opacityVal) {
        var rect = gc.addProperty("ADBE Vector Shape - Rect");
        rect.property("Size").setValue([w, h]);
        rect.property("Position").setValue([0, 0]);
        addStroke(gc, 2, opacityVal);
    }

    function createLineShape(x1, y1, x2, y2) {
        var shp = new Shape();
        shp.vertices = [[x1,y1],[x2,y2]];
        shp.inTangents = [[0,0],[0,0]];
        shp.outTangents = [[0,0],[0,0]];
        shp.closed = false;
        return shp;
    }

    function anchorOffsetForRect(baseW, baseH, rectW, rectH, anchorText) {
        var left = -baseW/2, right = baseW/2, top = -baseH/2, bottom = baseH/2;

        if (anchorText === "左上")      return { x: left + rectW/2,  y: top + rectH/2 };
        if (anchorText === "右上")      return { x: right - rectW/2, y: top + rectH/2 };
        if (anchorText === "左下")      return { x: left + rectW/2,  y: bottom - rectH/2 };
        if (anchorText === "右下")      return { x: right - rectW/2, y: bottom - rectH/2 };
        return { x: 0, y: 0 }; // 中央
    }

    function makeLogSpiralShapeFitted(targetW, targetH, delta, anchorText) {
        // Log spiral: r = delta^(2θ/π)  (quarter-turn -> *delta)
        var turnsQuarter = 8;        // 2 turns
        var ptsPerQuarter = 28;
        var thetaMax = turnsQuarter * (Math.PI / 2);
        var steps = turnsQuarter * ptsPerQuarter;

        var pts = [];
        var minX =  1e9, minY =  1e9, maxX = -1e9, maxY = -1e9;

        for (var i = 0; i <= steps; i++) {
            var t = (thetaMax * i) / steps;
            var r = Math.pow(delta, (2 * t / Math.PI));
            var x = r * Math.cos(t);
            var y = r * Math.sin(t);

            // convert to AE coords (y down)
            y = -y;

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;

            pts.push([x,y]);
        }

        var bw = (maxX - minX); if (bw <= 0) bw = 1;
        var bh = (maxY - minY); if (bh <= 0) bh = 1;

        // FIT INSIDE target rect (no stretch, uniform)
        var s = Math.min(targetW / bw, targetH / bh);

        // scale bounds
        var sMinX = minX * s, sMaxX = maxX * s, sMinY = minY * s, sMaxY = maxY * s;

        // target edges (local coords, rect centered at 0,0)
        var tLeft = -targetW/2, tRight = targetW/2, tTop = -targetH/2, tBottom = targetH/2;

        // offset by anchor inside target rect
        var dx = 0, dy = 0;

        if (anchorText === "左上")      { dx = tLeft  - sMinX; dy = tTop    - sMinY; }
        else if (anchorText === "右上") { dx = tRight - sMaxX; dy = tTop    - sMinY; }
        else if (anchorText === "左下") { dx = tLeft  - sMinX; dy = tBottom - sMaxY; }
        else if (anchorText === "右下") { dx = tRight - sMaxX; dy = tBottom - sMaxY; }
        else {
            dx = -((sMinX + sMaxX) / 2);
            dy = -((sMinY + sMaxY) / 2);
        }

        var verts = [];
        var inT = [];
        var outT = [];
        for (var j = 0; j < pts.length; j++) {
            verts.push([pts[j][0]*s + dx, pts[j][1]*s + dy]);
            inT.push([0,0]); outT.push([0,0]);
        }

        var shp = new Shape();
        shp.vertices = verts;
        shp.inTangents = inT;
        shp.outTangents = outT;
        shp.closed = false;
        return shp;
    }

    function addGuideGroupOpacityExpression(group, ratioIdx) {
        // Show if selected == ratioIdx OR selected == 7 (All)
        // Robust effect access: effect(1)(1) fallback by name
        var expr =
            "var m = 7;\n" +
            "try { m = thisLayer.effect(1)(1).value; } catch (e1) {\n" +
            "  try { m = thisLayer.effect('Ratio Guide Select')(1).value; } catch (e2) { m = 7; }\n" +
            "}\n" +
            "(m==" + ratioIdx + " || m==7) ? 100 : 0;";
        var op = group.property("Transform").property("Opacity");
        op.expression = expr;
        op.expressionEnabled = true;
    }

    function splitLines_Metallic(delta, nSquares, rectW, rectH, maxSteps, minSize) {
        // returns array of Shapes (lines) within rect centered at 0,0
        // algorithm: metallic mean rectangle subdivision (remove nSquares squares each step, rotate)
        var shapes = [];

        var left = -rectW/2, top = -rectH/2;
        var w = rectW, h = rectH;

        for (var step = 0; step < maxSteps; step++) {
            if (Math.min(w, h) < minSize) break;

            if (w >= h) {
                // horizontal: remove nSquares squares of size h along width
                var size = h;
                for (var k = 1; k <= nSquares; k++) {
                    var x = left + size * k;
                    if (x >= left + w - 0.01) break;
                    shapes.push(createLineShape(x, top, x, top + h));
                }
                // remaining rect on the right
                left = left + size * nSquares;
                w = w - size * nSquares;
                // orientation flips naturally next loop (likely w < h)
            } else {
                // vertical: remove nSquares squares of size w along height
                var size2 = w;
                for (var kk = 1; kk <= nSquares; kk++) {
                    var y = top + size2 * kk;
                    if (y >= top + h - 0.01) break;
                    shapes.push(createLineShape(left, y, left + w, y));
                }
                // remaining rect on bottom
                top = top + size2 * nSquares;
                h = h - size2 * nSquares;
            }
        }
        return shapes;
    }

    function splitLines_WhiteSilverSqrt2(rectW, rectH, maxSteps, minSize) {
        // √2 ratio subdivision: split long side in half (self-similar by halving)
        var shapes = [];

        var left = -rectW/2, top = -rectH/2;
        var w = rectW, h = rectH;

        for (var step = 0; step < maxSteps; step++) {
            if (Math.min(w, h) < minSize) break;

            if (w >= h) {
                var x = left + w/2;
                shapes.push(createLineShape(x, top, x, top + h));
                // continue with left half (rotates next)
                w = w/2;
            } else {
                var y = top + h/2;
                shapes.push(createLineShape(left, y, left + w, y));
                h = h/2;
            }
        }
        return shapes;
    }

    function getSelectedLayerBoundsApprox(comp) {
        var sel = comp.selectedLayers;
        if (!sel || sel.length === 0) return null;

        var lyr = sel[0];
        var pos = lyr.property("Transform").property("Position").value;
        var scale = lyr.property("Transform").property("Scale").value;
        var anchor = lyr.property("Transform").property("Anchor Point").value;

        var w = 0, h = 0;
        var center = [pos[0], pos[1]];

        try {
            var r = lyr.sourceRectAtTime(comp.time, false);
            if (r && r.width && r.height) {
                w = r.width * (scale[0]/100);
                h = r.height * (scale[1]/100);

                var localCenter = [r.left + r.width/2, r.top + r.height/2];
                var dx = (localCenter[0] - anchor[0]) * (scale[0]/100);
                var dy = (localCenter[1] - anchor[1]) * (scale[1]/100);
                center = [pos[0] + dx, pos[1] + dy];
            }
        } catch (e1) {}

        if (w <= 0 || h <= 0) {
            try {
                if (lyr.width && lyr.height) {
                    w = lyr.width * (scale[0]/100);
                    h = lyr.height * (scale[1]/100);
                    center = [pos[0], pos[1]];
                }
            } catch (e2) {}
        }

        if (w <= 0 || h <= 0) return null;
        return { w: w, h: h, center: center };
    }

    function trySetupDropdownItems(dropdownEffect, labels) {
        try {
            var menuProp = dropdownEffect.property(1);
            if (menuProp && menuProp.setPropertyParameters) menuProp.setPropertyParameters(labels);
        } catch (e) {}
    }
    function createMetallicGuideLayer(comp, baseW, baseH, centerPos, guideTypeText, fitModeText, anchorText) {
        var layerName = "[RatioGuide] " + Math.round(baseW) + "x" + Math.round(baseH);
        var shapeLayer = comp.layers.addShape();
        shapeLayer.name = layerName;

        // ガイドレイヤー化（レンダーに乗らないガイド扱い）
        try { shapeLayer.guideLayer = true; } catch (e0) {}

        shapeLayer.property("Transform").property("Position").setValue(centerPos);

        // Dropdown: ratio select
        var fx = shapeLayer.property("Effects").addProperty("ADBE Dropdown Control");
        fx.name = "Ratio Guide Select";
        var labels = ["黄金比","白銀比","銀比","青銅比","銅比","ニッケル比","全部表示"];
        trySetupDropdownItems(fx, labels);

        var contents = shapeLayer.property("Contents");
        addBBoxGroup(contents, baseW, baseH);

        // Ratios for guide (include √2 as "白銀比")
        var ratios = [
            { name:"黄金比",     delta:PHI,    idx:1, kind:"metallic", n:1 },
            { name:"白銀比",     delta:SQRT2,  idx:2, kind:"sqrt2",    n:0 },
            { name:"銀比",       delta:SILVER, idx:3, kind:"metallic", n:2 },
            { name:"青銅比",     delta:BRONZE, idx:4, kind:"metallic", n:3 },
            { name:"銅比",       delta:COPPER, idx:5, kind:"metallic", n:4 },
            { name:"ニッケル比", delta:NICKEL, idx:6, kind:"metallic", n:5 }
        ];

        var baseIsLandscape = (baseW >= baseH);

        for (var i = 0; i < ratios.length; i++) {
            var r = ratios[i];

            // choose orientation by base bbox
            var aspect = baseIsLandscape ? r.delta : (1 / r.delta);

            // fit ratio-rect by mode (contain/cover) relative to bbox
            var rr = fitRectByMode(baseW, baseH, aspect, fitModeText);
            var rectW = rr.w;
            var rectH = rr.h;

            // place ratio-rect within bbox by anchor
            var off = anchorOffsetForRect(baseW, baseH, rectW, rectH, anchorText);

            var g = contents.addProperty("ADBE Vector Group");
            g.name = r.name + " Guide";

            // move group so that its local origin is center of ratio-rect
            g.property("Transform").property("Position").setValue([off.x, off.y]);

            var gc = g.property("Contents");

            // ratio rectangle outline (valid region)
            addRatioRectOutline(gc, rectW, rectH, 28);

            if (guideTypeText === "スパイラル") {
                var path = gc.addProperty("ADBE Vector Shape - Group");
                path.name = r.name + " Spiral";
                path.property("Path").setValue(makeLogSpiralShapeFitted(rectW, rectH, r.delta, anchorText));
                addStroke(gc, 3, 100);
            } else {
                // split lines
                var lines;
                if (r.kind === "sqrt2") {
                    lines = splitLines_WhiteSilverSqrt2(rectW, rectH, 9, 18);
                } else {
                    lines = splitLines_Metallic(r.delta, r.n, rectW, rectH, 9, 18);
                }

                // one stroke for lines (apply after adding line paths)
                for (var li = 0; li < lines.length; li++) {
                    var lp = gc.addProperty("ADBE Vector Shape - Group");
                    lp.name = "Line " + (li+1);
                    lp.property("Path").setValue(lines[li]);
                }
                addStroke(gc, 2, 85);
            }

            addGuideGroupOpacityExpression(g, r.idx);
        }

        // default: All
        try { fx.property(1).setValue(7); } catch (e3) {}

        return shapeLayer;
    }

    // -----------------------------
    // UI
    // -----------------------------
    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel) ? thisObj : new Window("palette", "Ratio Rect Maker", undefined, { resizeable: true });
        win.orientation = "column";
        win.alignChildren = ["fill", "top"];

        // Base size（共通）
        var pBase = win.add("panel", undefined, "基準サイズ");
        pBase.orientation = "column";
        pBase.alignChildren = ["fill", "top"];
        pBase.margins = 10;

        var gBaseTop = pBase.add("group");
        gBaseTop.orientation = "row";
        gBaseTop.alignChildren = ["left", "center"];
        var rbUseComp = gBaseTop.add("radiobutton", undefined, "アクティブコンポ");
        var rbUseCustom = gBaseTop.add("radiobutton", undefined, "数値指定");
        rbUseComp.value = true;

        var gWH = pBase.add("group");
        gWH.orientation = "row";
        gWH.alignChildren = ["left", "center"];
        gWH.add("statictext", undefined, "W:");
        var etW = gWH.add("edittext", undefined, "1920"); etW.characters = 5;
        gWH.add("statictext", undefined, "H:");
        var etH = gWH.add("edittext", undefined, "1080"); etH.characters = 5;

        var stInfo = pBase.add("statictext", undefined, "基準：-");
        stInfo.characters = 28;

        // Sort（共通）
        var pSort = win.add("panel", undefined, "ソート");
        pSort.orientation = "row";
        pSort.alignChildren = ["left", "center"];
        pSort.margins = 10;

        pSort.add("statictext", undefined, "順番:");
        var ddSort = pSort.add("dropdownlist", undefined, ["比率順", "横幅順", "縦幅順"]);
        ddSort.selection = 0;

        // Dropdown（共通）
        var pSel = win.add("panel", undefined, "比率・サイズ（矩形/ガイドの基準に使用）");
        pSel.orientation = "column";
        pSel.alignChildren = ["fill", "top"];
        pSel.margins = 10;

        var dd = pSel.add("dropdownlist", undefined, []);
        dd.preferredSize.width = 300; // narrow UI
        dd.preferredSize.height = 22;

        var gCommonBtns = win.add("group");
        gCommonBtns.orientation = "row";
        gCommonBtns.alignChildren = ["left", "center"];
        var btnRefresh = gCommonBtns.add("button", undefined, "リスト更新");

        // Tabs（矩形 / ガイド）
        var tabs = win.add("tabbedpanel");
        tabs.alignChildren = ["fill", "top"];
        tabs.margins = 0;

        var tabRect = tabs.add("tab", undefined, "矩形生成");
        tabRect.orientation = "column";
        tabRect.alignChildren = ["fill", "top"];

        var tabGuide = tabs.add("tab", undefined, "ガイド生成");
        tabGuide.orientation = "column";
        tabGuide.alignChildren = ["fill", "top"];

        // Rect tab: Layer type
        var pType = tabRect.add("panel", undefined, "生成レイヤー");
        pType.orientation = "row";
        pType.alignChildren = ["left", "center"];
        pType.margins = 10;

        var rbShape = pType.add("radiobutton", undefined, "シェイプ");
        var rbSolid = pType.add("radiobutton", undefined, "平面");
        rbShape.value = true;

        var gRectRun = tabRect.add("group");
        gRectRun.orientation = "column";
        gRectRun.alignChildren = ["fill", "center"];
        var btnMakeRect = gRectRun.add("button", undefined, "矩形を生成");
        var btnUpdateRect = gRectRun.add("button", undefined, "選択矩形をサイズ更新");

        // Guide tab: settings
        var pGuide = tabGuide.add("panel", undefined, "ガイド設定");
        pGuide.orientation = "column";
        pGuide.alignChildren = ["fill", "top"];
        pGuide.margins = 10;

        var gGuide1 = pGuide.add("group");
        gGuide1.orientation = "row";
        gGuide1.alignChildren = ["left", "center"];
        gGuide1.add("statictext", undefined, "種類:");
        var ddGuideType = gGuide1.add("dropdownlist", undefined, ["スパイラル", "分割ライン"]);
        ddGuideType.selection = 0;

        var gGuide2 = pGuide.add("group");
        gGuide2.orientation = "row";
        gGuide2.alignChildren = ["left", "center"];
        gGuide2.add("statictext", undefined, "フィット:");
        var ddGuideFit = gGuide2.add("dropdownlist", undefined, ["内接（正確）", "外接（正確・見切れ）"]);
        ddGuideFit.selection = 0;

        var gGuide3 = pGuide.add("group");
        gGuide3.orientation = "row";
        gGuide3.alignChildren = ["left", "center"];
        gGuide3.add("statictext", undefined, "アンカー:");
        var ddGuideAnchor = gGuide3.add("dropdownlist", undefined, ["中央", "左上", "右上", "左下", "右下"]);
        ddGuideAnchor.selection = 0;

        var gGuideRun = tabGuide.add("group");
        gGuideRun.orientation = "column";
        gGuideRun.alignChildren = ["fill", "center"];
        var btnMakeGuide = gGuideRun.add("button", undefined, "ガイドを生成");

        // -----------------------------
        // Logic
        // -----------------------------
        function getBaseSize() {
            var baseW, baseH;

            if (rbUseComp.value) {
                var comp = app.project.activeItem;
                if (!isComp(comp)) { stInfo.text = "基準：アクティブコンポなし"; return null; }
                baseW = comp.width; baseH = comp.height;
            } else {
                baseW = parsePositiveInt(etW.text, 1920);
                baseH = parsePositiveInt(etH.text, 1080);
            }

            baseW = clampMinInt(baseW, 2);
            baseH = clampMinInt(baseH, 2);
            stInfo.text = "基準：" + baseW + "×" + baseH + (rbUseComp.value ? "（Comp）" : "（入力）");
            return { w: baseW, h: baseH };
        }

        function updateEnableState() {
            var useCustom = rbUseCustom.value;
            etW.enabled = useCustom;
            etH.enabled = useCustom;
        }

        function getSortMode() { return (ddSort.selection ? ddSort.selection.text : "比率順"); }

        function rebuildDropdown() {
            var base = getBaseSize();
            if (!base) { dd.removeAll(); return; }

            var prevId = (dd.selection && dd.selection.data && dd.selection.data.id) ? dd.selection.data.id : null;
            var list = [];
            var sortMode = getSortMode();

            for (var v = 0; v < VARIANTS.length; v++) {
                var variant = VARIANTS[v];
                var maxRect = calcMaxRect(base.w, base.h, variant.ratioWH);
                var groupIndex = getRatioGroupIndex(variant.name);
                var orientKey = orientationSortKey(variant.orientation);

                for (var i = 0; i < variant.scales.length; i++) {
                    var s = variant.scales[i];
                    var w = Math.round(maxRect.w * s);
                    var h = Math.round(maxRect.h * s);
                    if (w < 2 || h < 2) continue;

                    var desc;
                    if (i === 0) {
                        var fit = (maxRect.limit === "height") ? "基準高ぴったり" : "基準幅ぴったり";
                        desc = fit + "・最大級";
                    } else {
                        desc = getStageDesc(variant.scales.length, i, variant.orientation);
                    }

                    // サイズ：比率区分：縦長or横長：（一言コメント）
                    var label = w + "×" + h + "：" + variant.name + "：" + variant.orientation + "（" + desc + "）";

                    list.push({
                        id: variant.key + "|" + i,
                        label: label,
                        w: w,
                        h: h,
                        groupIndex: groupIndex,
                        orientKey: orientKey,
                        stageIndex: i
                    });
                }
            }

            list.sort(function (a, b) {
                if (sortMode === "横幅順") {
                    if (b.w !== a.w) return (b.w - a.w);
                    if (b.h !== a.h) return (b.h - a.h);
                    if (a.groupIndex !== b.groupIndex) return (a.groupIndex - b.groupIndex);
                    if (a.orientKey !== b.orientKey) return (a.orientKey - b.orientKey);
                    return (a.stageIndex - b.stageIndex);
                } else if (sortMode === "縦幅順") {
                    if (b.h !== a.h) return (b.h - a.h);
                    if (b.w !== a.w) return (b.w - a.w);
                    if (a.groupIndex !== b.groupIndex) return (a.groupIndex - b.groupIndex);
                    if (a.orientKey !== b.orientKey) return (a.orientKey - b.orientKey);
                    return (a.stageIndex - b.stageIndex);
                } else {
                    if (a.groupIndex !== b.groupIndex) return (a.groupIndex - b.groupIndex);
                    if (a.orientKey !== b.orientKey) return (a.orientKey - b.orientKey);
                    if (a.stageIndex !== b.stageIndex) return (a.stageIndex - b.stageIndex);
                    if (b.w !== a.w) return (b.w - a.w);
                    return (b.h - a.h);
                }
            });

            dd.removeAll();
            for (var k = 0; k < list.length; k++) {
                var it = dd.add("item", list[k].label);
                it.data = { id: list[k].id, w: list[k].w, h: list[k].h };
            }

            if (dd.items.length > 0) {
                var selected = null;
                if (prevId) {
                    for (var s = 0; s < dd.items.length; s++) {
                        if (dd.items[s].data && dd.items[s].data.id === prevId) { selected = dd.items[s]; break; }
                    }
                }
                dd.selection = selected ? selected : dd.items[0];
            }
        }

        function makeRectOrSolid() {
            var comp = app.project.activeItem;
            if (!isComp(comp)) { alert("アクティブコンポがありません。"); return; }
            if (!dd.selection || !dd.selection.data) { alert("比率・サイズを選択してください。"); return; }

            var w = clampMinInt(dd.selection.data.w, 2);
            var h = clampMinInt(dd.selection.data.h, 2);
            var layerName = "[RatioRect] " + dd.selection.text;

            var ref = getInsertionLayer(comp);

            app.beginUndoGroup("Create Ratio Rect");

            var newLayer = rbShape.value ? createShapeRect(comp, w, h, layerName) : createSolidRect(comp, w, h, layerName);

            if (ref) newLayer.moveAfter(ref);
            else newLayer.moveToBeginning();

            for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
            newLayer.selected = true;

            app.endUndoGroup();
        }

        function makeGuide() {
            var comp = app.project.activeItem;
            if (!isComp(comp)) { alert("アクティブコンポがありません。"); return; }

            // target bbox from selection, else from dropdown
            var target = getSelectedLayerBoundsApprox(comp);
            if (!target) {
                if (!dd.selection || !dd.selection.data) { alert("選択レイヤーがない場合は、比率・サイズを選択してください。"); return; }
                target = { w: dd.selection.data.w, h: dd.selection.data.h, center: [comp.width/2, comp.height/2] };
            }

            var baseW = clampMinInt(target.w, 2);
            var baseH = clampMinInt(target.h, 2);

            var guideTypeText = ddGuideType.selection ? ddGuideType.selection.text : "スパイラル";
            var fitModeText = ddGuideFit.selection ? ddGuideFit.selection.text : "内接（正確）";
            var anchorText = ddGuideAnchor.selection ? ddGuideAnchor.selection.text : "中央";

            var ref = getInsertionLayer(comp);

            app.beginUndoGroup("Create Ratio Guide");

            var guideLayer = createMetallicGuideLayer(comp, baseW, baseH, target.center, guideTypeText, fitModeText, anchorText);

            if (ref) guideLayer.moveAfter(ref);
            else guideLayer.moveToBeginning();

            for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
            guideLayer.selected = true;

            app.endUndoGroup();
        }

        function updateSelectedRectShapes() {
            var comp = app.project.activeItem;
            if (!isComp(comp)) { alert("アクティブコンポがありません。"); return; }
            if (!dd.selection || !dd.selection.data) { alert("比率・サイズを選択してください。"); return; }

            var sel = comp.selectedLayers;
            if (!sel || sel.length === 0) { alert("更新したい矩形シェイプレイヤーを選択してください。"); return; }

            var w = clampMinInt(dd.selection.data.w, 2);
            var h = clampMinInt(dd.selection.data.h, 2);

            app.beginUndoGroup("Update Rect Shape Size");

            var updated = 0;
            for (var i = 0; i < sel.length; i++) {
                var lyr = sel[i];
                if (!lyr || lyr.matchName !== "ADBE Vector Layer") continue;

                var contents = lyr.property("Contents");
                if (!contents) continue;

                var sizeProp = findFirstRectSizeProp(contents);
                if (sizeProp) { sizeProp.setValue([w, h]); updated++; }
            }

            app.endUndoGroup();

            if (updated === 0) alert("選択の中に「矩形パスを持つシェイプレイヤー」が見つかりませんでした。");
        }

        // Events
        rbUseComp.onClick = function () { updateEnableState(); rebuildDropdown(); };
        rbUseCustom.onClick = function () { updateEnableState(); rebuildDropdown(); };

        etW.onChanging = function () { if (rbUseCustom.value) rebuildDropdown(); };
        etH.onChanging = function () { if (rbUseCustom.value) rebuildDropdown(); };
        ddSort.onChange = function () { rebuildDropdown(); };

        btnRefresh.onClick = function () { rebuildDropdown(); };
        btnMakeRect.onClick = function () { makeRectOrSolid(); };
        btnMakeGuide.onClick = function () { makeGuide(); };
        btnUpdateRect.onClick = function () { updateSelectedRectShapes(); };

        // init
        updateEnableState();
        rebuildDropdown();

        tabs.selection = tabRect;

        win.layout.layout(true);
        win.layout.resize();
        win.onResizing = win.onResize = function () { this.layout.resize(); };

        return win;
    }
    var myUI = buildUI(thisObj);
    if (myUI instanceof Window) { myUI.center(); myUI.show(); }

})(this);
