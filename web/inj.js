import { PDFViewerApplication } from "./app.js";

var HLS = [];

window.HLS = HLS;

function GetCurrentPagenumber() {
    return PDFViewerApplication.pdfViewer.currentPageNumber - 1;
}

function GetCurrentPageScale() {
    return PDFViewerApplication.pdfViewer.getPageView(GetCurrentPagenumber()).viewport.scale
}

function GetCurrentPageCanvas() {
    return PDFViewerApplication.pdfViewer.getPageView(GetCurrentPagenumber()).annotationLayer.pageDiv.querySelector('canvas')
}

function GetCurrentSelectionRects() {
    var selection = window.getSelection();
    var getRange = selection.getRangeAt(0);
    return getRange.getClientRects();
}

// GetAreaNeedToDrawPNG 这里我们计算出rect的最大值和最小值从Canvas里面抠个图片出来。
function GetAreaNeedToDrawPNG(rects) {
    var left = rects[0].left;
    var top = rects[0].top;
    var right = rects[0].right;
    var bottom = rects[0].bottom;

    for (var r of rects) {
        if (r.left < left) {
            left = r.left;
        }
        if (r.top < top) {
            top = r.top;
        }
        if (r.right > right) {
            right = r.right
        }
        if (r.bottom > bottom) {
            bottom = r.bottom
        }
    }

    return {
        left: left,
        top: top,
        right: right,
        bottom: bottom,
    }
}

function CurrentPageCanvas2PNG(position) {
    const canvas = GetCurrentPageCanvas();
    const ctx = canvas.getContext('2d');
    const doc = canvas ? canvas.ownerDocument : null;
    const newCanvas = doc && doc.createElement("canvas");
    const width = position.right - position.left;
    const height = position.bottom - position.top;
    newCanvas.width = width;
    newCanvas.height = height;

    console.log("width and height of new canvas", width, height);

    const newCanvasContext = newCanvas.getContext("2d");
    if (!newCanvasContext || !canvas) {
        return "";
    }

    const dpr = window.devicePixelRatio;
    newCanvasContext.drawImage(
        canvas,
        position.left * dpr,
        position.top * dpr,
        width * dpr,
        height * dpr,
        0,
        0,
        width,
        height
    );

    return newCanvas.toDataURL("image/png");
}

function SelectionRects2CurrentPageRects(rects) {
    if (rects.length === 0) {
        return null;
    }
    var res = [];
    var crect = GetCurrentPageCanvas().getBoundingClientRect();
    for (var i = 0; i < rects.length; i++) {
        res.push(
            {
                top: rects[i].top - crect.y,
                left: rects[i].left - crect.x,
                bottom: rects[i].bottom - crect.y,
                right: rects[i].right - crect.x,
                x: rects[i].x - crect.x,
                y: rects[i].y - crect.y,
                width: rects[i].width,
                height: rects[i].height,
            }
        )
    }
    return res;
}

function highLight() {
    highLightRects(GetCurrentSelectionRects())
}

function highLightArea() {
    var para = [];
    para.push(box.getBoundingClientRect());
    highLightRects(para)
}

function highLightRects(origin_rects) {
    var rects = SelectionRects2CurrentPageRects(origin_rects)
    var pdfRects = [];
    var scale = GetCurrentPageScale();
    const currentPage = GetCurrentPagenumber()
    for (var i = 0; i < rects.length; i++) {
        var r = rects[i]
        var HL = document.createElement('div');
        HL.className = "HLP"
        HL.style.cssText = `left: ${r.x}px; top: ${r.y}px; width: ${r.width}px; height: ${r.height}px;`
        PDFViewerApplication.pdfViewer.getPageView(currentPage).textLayer.textLayerDiv.getElementsByClassName("HLayer")[0].appendChild(HL)
        pdfRects.push(
            {
                x: r.x / scale,
                y: r.y / scale,
                width: r.width / scale,
                height: r.height / scale
            }
        )
    }
    findPageOutline(currentPage).then((resp) => {
        HLS.push(
            {
                content: GetSelectionText(),
                rects: pdfRects,
                page: currentPage,
                png: CurrentPageCanvas2PNG(GetAreaNeedToDrawPNG(rects)),
                doc_position: document.querySelector("#viewBookmark").getAttribute('href'),
                tags: resp
            }
        )
    })

}

async function findPageOutline(pageNumber) {
    var res = [];
    await PDFViewerApplication.pdfDocument.getOutline().then(async outline => {
        await readPDFoutline(pageNumber, outline, PDFViewerApplication.pdfDocument.numPages);
    });

    async function readPDFoutline(pageNumber, outline, lastLevelMaxPage) {
        if (outline) {
            var currentLevelOutline = [];
            for (var o1index = 0; o1index < outline.length; o1index++) {
                var o = outline[o1index];
                const title = o.title;
                const tag = o.dest[0];
                await PDFViewerApplication.pdfDocument.getPageIndex(tag).then(function (id) {
                    currentLevelOutline.push(
                        {
                            title: title,
                            pageNumber: id
                        }
                    )
                });
            }
            for (var oindex = 0; oindex < currentLevelOutline.length; oindex++) {
                if (pageNumber > lastLevelMaxPage) {
                    break;
                }
                if (oindex === currentLevelOutline.length - 1) {// last one
                    if (pageNumber > currentLevelOutline[oindex].pageNumber) {
                        res.push(
                            currentLevelOutline[oindex].title
                        )
                        await readPDFoutline(pageNumber, outline[oindex].items, lastLevelMaxPage);
                    }
                    break;
                }
                if ((pageNumber >= currentLevelOutline[oindex].pageNumber) && (pageNumber < currentLevelOutline[oindex + 1].pageNumber)) {
                    res.push(
                        currentLevelOutline[oindex].title
                    )
                    await readPDFoutline(pageNumber, outline[oindex].items, currentLevelOutline[oindex + 1].pageNumber - 1);
                }

            }
        }
    }

    return res;
};

function GetSelectionText() {
    var text = "";
    if (window.getSelection) {
        text = window.getSelection().toString();
    } else if (document.selection && document.selection.type != "Control") {
        text = document.selection.createRange().text;
    }
    return text;
}

function drawHL(currentPage) {
    var scale = GetCurrentPageScale();
    var target_div = PDFViewerApplication.pdfViewer.getPageView(currentPage).textLayer.textLayerDiv

    var HLayer = document.createElement('div');
    HLayer.className = "HLayer"

    for (var hl of HLS) {
        if (hl.page === currentPage) {
            for (var r of hl.rects) {
                var HLELE = document.createElement('div');
                HLELE.className = "HLP"
                HLELE.style.cssText = `left: ${r.x * scale}px; top: ${r.y * scale}px; width: ${r.width * scale}px; height: ${r.height * scale}px;`
                HLayer.appendChild(HLELE)
            }
        }
    }

    target_div.appendChild(HLayer);
}

async function picturebox() {
    var sheet = window.document.styleSheets[0];
    sheet.insertRule(`
    .HLP{
        cursor: pointer;
        position: absolute;
        background: #ffe28f;
    }
    `, sheet.cssRules.length);
    sheet.insertRule(`
    #box {
        width:100px;
        height:100px;
        background-color:hsla(168,100%,50%,0.3);
        position:absolute;
        z-index: 1000;
    }
    `, sheet.cssRules.length);
    sheet.insertRule(`
    #scale {
        width:10px;
        height:10px;
        overflow:hidden;
        cursor:se-resize;
        position:absolute;
        right:0;
        bottom:0;
        background-color:rgb(122,191,238);
    }
    `, sheet.cssRules.length);
    await sleep(1000);
    var BOXELE = document.createElement('div');
    BOXELE.id = "box";
    var SCALEELE = document.createElement('div');
    SCALEELE.id = "scale";
    BOXELE.appendChild(SCALEELE);
    document.body.insertBefore(BOXELE, document.body.childNodes[0]);

    // box是装图片的容器,father是图片移动缩放的范围,scale是控制缩放的小图标
    var father = document.body;
    var box = document.getElementById("box");
    var scale = document.getElementById("scale");

  var startPos = null
  function onDivMove(ev) {
    if (!startPos) {
      return
    }
    const localClientX = ev.clientX ? ev.clientX : ev.touches[0].clientX
    const localClientY = ev.clientY ? ev.clientY : ev.touches[0].clientY
    var x = localClientX - box.offsetWidth / 2;
    var y = localClientY - box.offsetHeight / 2;

    // 图形移动的边界判断
    // x = x <= 0 ? 0 : x;
    // x = x >= father.offsetWidth - box.offsetWidth ? father.offsetWidth - box.offsetWidth : x;
    // y = y <= 0 ? 0 : y;
    // y = y >= father.offsetHeight - box.offsetHeight ? father.offsetHeight - box.offsetHeight : y;
    box.style.transform = `translate(${x}px, ${y}px)`
    // box.style.left = x + 'px';
    // box.style.top = y + 'px';
  }

  function onMouseDown(ev) {
    startPos = ev;
    // 浏览器有一些图片的默认事件,这里要阻止
    startPos.preventDefault();
    // 图形移出父盒子取消移动事件,防止移动过快触发鼠标移出事件,导致鼠标弹起事件失效
  }

  function onEventEnd(ev) {
    startPos = null
  }

  // 图片移动效果
  box.addEventListener('touchstart', onMouseDown)
  box.addEventListener('mousedown', onMouseDown)

  box.addEventListener('touchmove', onDivMove)
  box.addEventListener('mousemove', onDivMove)

  box.addEventListener('touchend', onEventEnd)
  box.addEventListener('mouseup', onEventEnd)
    // 图片缩放效果
    function onScaleDown(e) {
        // 阻止冒泡,避免缩放时触发移动事件
        e.stopPropagation();
        e.preventDefault();
        var pos = {
            'w': box.offsetWidth,
            'h': box.offsetHeight,
            'x': e.clientX,
            'y': e.clientY
        };
        father.onmousemove = function (ev) {
            ev.preventDefault();
            // 设置图片的最小缩放为30*30
            var w = Math.max(30, ev.clientX - pos.x + pos.w)
            var h = Math.max(30, ev.clientY - pos.y + pos.h)
            // console.log(w,h)

            // 设置图片的最大宽高
            w = w >= father.offsetWidth - box.offsetLeft ? father.offsetWidth - box.offsetLeft : w
            h = h >= father.offsetHeight - box.offsetTop ? father.offsetHeight - box.offsetTop : h
            box.style.width = w + 'px';
            box.style.height = h + 'px';
            // console.log(box.offsetWidth,box.offsetHeight)
        }
        father.onmouseleave = function () {
            father.onmousemove = null;
            father.onmouseup = null;
        }
        father.onmouseup = function () {
            father.onmousemove = null;
            father.onmouseup = null;
        }
    }
  scale.addEventListener('mousedown', onScaleDown)
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createToolbarButton(name, func) {
    var HL = document.createElement("Button");
    HL.innerHTML = name;
    HL.onclick = func
    var F = document.getElementById("toolbarViewerLeft")
    F.appendChild(HL)
}

async function checkHLLayer() {
    while (true) {
        await sleep(700);
        if (document.readyState === "complete") {
            break;
        }
    }

    picturebox();// init picture box
    createToolbarButton("->HL<-", highLight);
    createToolbarButton("->HLA<-", highLightArea);

    while (true) {
        await sleep(700);
        const currentPage = GetCurrentPagenumber()
        if (PDFViewerApplication.pdfViewer.getPageView(currentPage).textLayer.textLayerDiv.getElementsByClassName("HLayer").length === 0) {
            drawHL(currentPage);
        }
    }
};

window.highLight = highLight;
window.highLightArea = highLightArea;
window.GetCurrentSelectionRects = GetCurrentSelectionRects;
window.checkHLLayer = checkHLLayer;

export { checkHLLayer, highLight, highLightArea };
