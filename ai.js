(function() {
    // 1. KIỂM TRA NẾU TOOL ĐÃ CHẠY THÌ KHÔNG CHẠY LẠI
    if (window.aiV7MenuActive) {
        alert("Tool AI đã chạy rồi Master!");
        return;
    }

    // 2. TẢI THƯ VIỆN CHỤP ẢNH (html2canvas)
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = initTool;
    document.head.appendChild(script);

    function initTool() {
        window.aiV7MenuActive = true;

        // 3. TẠO MENU
        var panel = document.createElement('div');
        panel.id = 'ai-v7-panel';
        panel.style.cssText = 'position:fixed; top:10px; right:10px; width:270px; background:rgba(15,15,15,0.95); color:#fff; border:2px solid #d4af37; border-radius:10px; padding:15px; z-index:999999; font-family:Arial; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.8);';
        panel.innerHTML = `
            <div style="font-weight:bold; color:#d4af37; margin-bottom:10px; font-size:16px;">AI V7 - GITHUB EDITION</div>
            <div id="v7-time" style="font-size:24px; font-weight:bold; color:#ff4757; margin-bottom:5px;">--</div>
            <div id="v7-res" style="font-size:18px; font-weight:bold; margin-bottom:5px; color:#aaa;">Chờ lệnh...</div>
            <div id="v7-log" style="font-size:11px; color:#888; text-align:left; height:60px; overflow-y:auto; border-top:1px solid #333; padding-top:5px; margin-bottom:10px;">> Đã tải module thành công.</div>
            <button id="v7-scan" style="margin-bottom:5px; width:100%; padding:10px; background:#ffa502; color:#fff; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">1. CHỌN VÙNG CẦU</button>
            <button id="v7-run" style="width:100%; padding:10px; background:#2ed573; color:#fff; border:none; border-radius:5px; font-weight:bold; display:none; cursor:pointer;">2. BẮT ĐẦU PHÂN TÍCH (8s)</button>
            <button id="v7-close" style="margin-top:10px; background:none; color:#ff4757; border:none; font-size:12px; text-decoration:underline; cursor:pointer;">Đóng Tool</button>
        `;
        document.body.appendChild(panel);

        var log = function(m) {
            var l = document.getElementById('v7-log');
            l.innerHTML += '<br>> ' + m;
            l.scrollTop = l.scrollHeight;
        };

        // 4. TẠO KHUNG CHỌN VÙNG
        var selBox = document.createElement('div');
        selBox.style.cssText = 'position:fixed; border:2px dashed #d4af37; background:rgba(212,175,55,0.2); z-index:999998; display:none; cursor:crosshair;';
        document.body.appendChild(selBox);

        var isDrawing = false;
        var startX, startY;
        var selectedData = { x: 0, y: 0, w: 0, h: 0 };

        // Xử lý sự kiện cảm ứng (Touch) cho điện thoại
        var handleStart = function(e) {
            isDrawing = true;
            var touch = e.touches ? e.touches[0] : e;
            startX = touch.clientX; startY = touch.clientY;
            selBox.style.left = startX + 'px'; selBox.style.top = startY + 'px';
            selBox.style.width = '0px'; selBox.style.height = '0px';
            e.preventDefault();
        };

        var handleMove = function(e) {
            if(!isDrawing) return;
            var touch = e.touches ? e.touches[0] : e;
            var w = touch.clientX - startX;
            var h = touch.clientY - startY;
            selBox.style.width = Math.abs(w) + 'px';
            selBox.style.height = Math.abs(h) + 'px';
            selBox.style.left = (w < 0 ? touch.clientX : startX) + 'px';
            selBox.style.top = (h < 0 ? touch.clientY : startY) + 'px';
            e.preventDefault();
        };

        var handleEnd = function(e) {
            if(!isDrawing) return;
            isDrawing = false;
            document.body.removeEventListener('mousedown', handleStart);
            document.body.removeEventListener('mousemove', handleMove);
            document.body.removeEventListener('mouseup', handleEnd);
            document.body.removeEventListener('touchstart', handleStart);
            document.body.removeEventListener('touchmove', handleMove);
            document.body.removeEventListener('touchend', handleEnd);

            var rect = selBox.getBoundingClientRect();
            selectedData = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
            selBox.style.display = 'none';
            
            document.getElementById('v7-scan').innerText = '1. CHỌN LẠI VÙNG';
            document.getElementById('v7-run').style.display = 'block';
            log('Đã chọn vùng: ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
        };

        document.getElementById('v7-scan').onclick = function() {
            this.style.display = 'none';
            document.getElementById('v7-run').style.display = 'none';
            selBox.style.display = 'block';
            log('Kéo để chọn vùng bảng cầu...');
            
            document.body.addEventListener('mousedown', handleStart);
            document.body.addEventListener('mousemove', handleMove);
            document.body.addEventListener('mouseup', handleEnd);
            document.body.addEventListener('touchstart', handleStart, {passive: false});
            document.body.addEventListener('touchmove', handleMove, {passive: false});
            document.body.addEventListener('touchend', handleEnd);
        };

        // 5. THUẬT TOÁN PHÂN TÍCH ĐIỂM ẢNH
        var analyzePattern = function(redPixels, bluePixels) {
            var total = redPixels + bluePixels;
            if(total === 0) return { res: 'LỖI', color: '#aaa', conf: 0, reason: 'Không thấy màu Đỏ/Xanh.' };
            
            var bRatio = redPixels / total;
            var pRatio = bluePixels / total;
            var pr = bRatio > pRatio ? 'B' : 'P';
            var conf = Math.round(Math.max(bRatio, pRatio) * 100);
            
            return {
                res: pr === 'B' ? 'NHÀ CÁI' : 'TAY CON',
                color: pr === 'B' ? '#ff4757' : '#1e90ff',
                conf: conf > 88 ? 88 : conf,
                reason: 'Đỏ: ' + Math.round(bRatio*100) + '% | Xanh: ' + Math.round(pRatio*100) + '%'
            };
        };

        // 6. BẮT ĐẦU QUÉT & PHÂN TÍCH
        document.getElementById('v7-run').onclick = function() {
            if(selectedData.w === 0) return;
            
            this.style.display = 'none';
            var timeLeft = 8;
            document.getElementById('v7-res').innerText = 'Đang đếm ngược...';
            document.getElementById('v7-res').style.color = '#fff';
            
            var timer = setInterval(function() {
                timeLeft--;
                document.getElementById('v7-time').innerText = timeLeft + 's';
                
                if(timeLeft <= 0) {
                    clearInterval(timer);
                    document.getElementById('v7-time').innerText = 'QUÉT...';
                    log('Đang chụp vùng đã chọn...');
                    
                    html2canvas(document.body, {
                        x: selectedData.x,
                        y: selectedData.y,
                        width: selectedData.w,
                        height: selectedData.h,
                        scale: 1,
                        logging: false
                    }).then(function(canvas) {
                        var ctx = canvas.getContext('2d');
                        var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                        
                        var red = 0, blue = 0;
                        for (var i = 0; i < imgData.length; i += 4) {
                            var r = imgData[i];
                            var g = imgData[i + 1];
                            var b = imgData[i + 2];
                            
                            // Nhận diện Đỏ (Nhà cái)
                            if (r > 130 && g < 90 && b < 90) red++;
                            // Nhận diện Xanh (Tay con)
                            else if (b > 130 && r < 90 && g < 150) blue++;
                        }
                        
                        var result = analyzePattern(red, blue);
                        
                        document.getElementById('v7-time').innerText = 'XONG';
                        document.getElementById('v7-res').innerHTML = 'CHỌN: <span style="color:' + result.color + '">' + result.res + '</span>';
                        document.getElementById('v7-log').innerHTML = '> ' + result.reason + '<br>> Độ tự tin: ' + result.conf + '%';
                        
                        document.getElementById('v7-run').style.display = 'block';
                        document.getElementById('v7-run').innerText = 'QUÉT LẠI (8s)';
                        document.getElementById('v7-scan').style.display = 'block';
                    }).catch(function(err) {
                        log('Lỗi chụp ảnh: ' + err);
                        document.getElementById('v7-run').style.display = 'block';
                    });
                }
            }, 1000);
        };

        // 7. ĐÓNG TOOL
        document.getElementById('v7-close').onclick = function() {
            panel.remove();
            selBox.remove();
            window.aiV7MenuActive = false;
        };
    }
})();
