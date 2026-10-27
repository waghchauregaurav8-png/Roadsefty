document.addEventListener('DOMContentLoaded', () => {
    initQuiz();
    initReportFeature();
    initDashboard();
    initPublicMap(); // NEW: Initializes the public map on the homepage
});

/* ==========================================================================
   PUBLIC COMMUNITY MAP & UPVOTE SYSTEM (NEW)
   ========================================================================== */
function initPublicMap() {
    if (!document.getElementById('publicMap')) return;
    
    // Default location centered on Sangamner
    const map = L.map('publicMap').setView([19.5760, 74.2053], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    fetch('/api/hazards').then(res => res.json()).then(hazards => {
        hazards.forEach(h => {
            const colors = { critical: '#FF3B30', high: '#FFD500', medium: '#3B82F6', low: '#00E676' };
            const upvotes = h.upvotes || 0;
            
            let verifiedTag = upvotes >= 3 
                ? `<div style="color:var(--color-green-success); font-weight:800; margin-top:5px;">✅ VERIFIED BY ${upvotes} CITIZENS</div>` 
                : `<div style="color:#555; font-weight:700; margin-top:5px;">⚠️ Pending Verification (${upvotes} votes)</div>`;
            
            const popupContent = `
                <div style="font-family:var(--font-body); padding:5px; min-width: 200px;">
                    <strong style="text-transform:uppercase; font-size:1.1rem;">${h.hazard_type}</strong><br>
                    <span style="font-weight:600;">SEVERITY: <span style="text-transform:uppercase;">${h.severity}</span></span>
                    ${verifiedTag}
                    <hr style="margin: 10px 0; border: 1px dashed #111;">
                    <button onclick="upvoteHazard(${h.id}, this)" class="btn btn-outline" style="width:100%; padding:0.5rem; font-size:0.8rem; border: 2px solid #111; cursor:pointer;">[+] I SAW THIS TOO</button>
                </div>
            `;

            L.circleMarker([h.latitude, h.longitude], {
                radius: 8, fillColor: colors[h.severity.toLowerCase()] || '#111',
                color: '#111', weight: 2, fillOpacity: 1
            }).bindPopup(popupContent).addTo(map);
        });
    });
}

// Function to handle the Upvote button click
window.upvoteHazard = async function(id, btnElement) {
    btnElement.disabled = true;
    btnElement.innerText = "VERIFYING...";
    try {
        const res = await fetch(`/api/upvote/${id}`, { method: 'POST' });
        const result = await res.json();
        if (result.success) {
            btnElement.innerText = "✅ VERIFIED";
            btnElement.style.background = "var(--color-green-success)";
            btnElement.style.color = "#111";
            btnElement.style.fontWeight = "bold";
        }
    } catch(e) {
        btnElement.innerText = "NETWORK ERROR";
    }
};

/* ==========================================================================
   INTERACTIVE ROAD SAFETY QUIZ (EASY LEVEL WITH PRE-FORM & CERTIFICATE)
   ========================================================================== */
const quizQuestions = [
    { category: "Basic Rules", question: "What does a RED traffic light mean?", options: ["Speed up", "Stop completely behind the line", "Honk horn", "Slow down"], correct: 1, explanation: "A red traffic light strictly means you must come to a complete stop." },
    { category: "Basic Rules", question: "Zebra crossings are meant for:", options: ["Parking vehicles", "Pedestrians to cross the road safely", "Two-wheelers only", "Taking a U-turn"], correct: 1, explanation: "Zebra crossings are designated safe zones for pedestrians to cross the road." },
    { category: "Safety Gear", question: "What is the primary purpose of wearing a seatbelt in a car?", options: ["To avoid police fines", "To keep your clothes clean", "To protect you from severe injury in an accident", "To sit comfortably"], correct: 2, explanation: "Seatbelts are life-saving devices designed to keep you securely in your seat during sudden stops or collisions." },
    { category: "Two-Wheeler Safety", question: "Who must wear a helmet on a two-wheeler?", options: ["Only the rider", "Only the passenger (pillion)", "Both the rider and the passenger", "No one, it is optional"], correct: 2, explanation: "By law and for safety, both the rider and the pillion passenger must wear certified helmets." },
    { category: "Law & Safety", question: "Is it legal to drink alcohol and drive a vehicle?", options: ["Yes, if you drive slowly", "No, it is highly dangerous and illegal", "Yes, but only on highways", "Yes, if it's late at night"], correct: 1, explanation: "Drinking and driving impairs your judgment and reaction time, making it illegal and fatal." },
    { category: "Distractions", question: "What should you do if your mobile phone rings while driving?", options: ["Answer it immediately", "Text the person back", "Park safely on the side of the road to answer", "Hold it with one hand and steer with the other"], correct: 2, explanation: "Using a mobile phone while driving is a major distraction. Always park safely before using it." },
    { category: "Emergency Vehicles", question: "What must you do when you hear an ambulance or fire engine siren behind you?", options: ["Speed up and race it", "Ignore it", "Stop completely in the middle of the road", "Move to the side and give way immediately"], correct: 3, explanation: "Emergency vehicles save lives. You must always give them a clear path to pass." },
    { category: "Basic Rules", question: "In India, on which side of the vehicle in front of you should you overtake?", options: ["Left side", "Right side", "Any side", "Over the footpath"], correct: 1, explanation: "In India, the traffic rule is to always overtake from the right side of the vehicle ahead of you." }
];

function initQuiz() {
    const quizIntroForm = document.getElementById('quizIntroForm');
    const startQuizBtn = document.getElementById('startQuizBtn');
    const quizNameInput = document.getElementById('quizName');
    const quizEmailInput = document.getElementById('quizEmail');
    const quizPhoneInput = document.getElementById('quizPhone');
    
    const quizContainer = document.getElementById('quizContainer');
    if (!quizContainer || !quizIntroForm) return;
    
    let currentQuestionIdx = 0;
    let userAnswers = new Array(quizQuestions.length).fill(null);
    let candidateName = "";

    const questionTitle = document.getElementById('questionTitle');
    const optionsContainer = document.getElementById('optionsContainer');
    const quizFeedback = document.getElementById('quizFeedback');
    const nextBtn = document.getElementById('nextQuestionBtn');
    const quizResultCard = document.getElementById('quizResultCard');

    if (startQuizBtn) {
        startQuizBtn.addEventListener('click', () => {
            if (!quizNameInput.value.trim() || !quizEmailInput.value.trim() || !quizPhoneInput.value.trim()) {
                alert("Please fill in all your details (Name, Email, Phone) to start the evaluation.");
                return;
            }
            candidateName = quizNameInput.value.trim();
            quizIntroForm.style.display = 'none';
            quizContainer.style.display = 'block';
            renderQuestion(0);
        });
    }

    function renderQuestion(index) {
        const q = quizQuestions[index];
        questionTitle.textContent = `${index + 1}. ${q.question}`;
        optionsContainer.innerHTML = '';
        quizFeedback.style.display = 'none';

        q.options.forEach((optText, optIdx) => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option-btn';
            btn.innerHTML = `<strong>${String.fromCharCode(65 + optIdx)}.</strong> ${optText}`;
            if (userAnswers[index] === null) {
                btn.addEventListener('click', () => {
                    userAnswers[index] = optIdx;
                    renderQuestion(index);
                });
            } else {
                btn.disabled = true;
                if (optIdx === q.correct) btn.classList.add('selected-correct');
                else if (optIdx === userAnswers[index]) btn.classList.add('selected-wrong');
            }
            optionsContainer.appendChild(btn);
        });

        if (userAnswers[index] !== null) {
            quizFeedback.style.display = 'block';
            quizFeedback.innerHTML = userAnswers[index] === q.correct ? 
                `<strong>Correct!</strong> ${q.explanation}` : 
                `<strong>Incorrect.</strong> ${q.explanation}`;
            quizFeedback.className = userAnswers[index] === q.correct ? 'alert-box alert-success' : 'alert-box alert-danger';
        }
        nextBtn.textContent = index === quizQuestions.length - 1 ? 'Finish Quiz ➔' : 'Next Question ➔';
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (userAnswers[currentQuestionIdx] === null) return alert('Select an answer first.');
            if (currentQuestionIdx < quizQuestions.length - 1) {
                renderQuestion(++currentQuestionIdx);
            } else {
                quizContainer.style.display = 'none';
                quizResultCard.style.display = 'block';
                
                let score = userAnswers.filter((ans, i) => ans === quizQuestions[i].correct).length;
                let percent = Math.round((score / quizQuestions.length) * 100);
                
                if (percent >= 80) {
                    const today = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
                    
                    quizResultCard.innerHTML = `
                        <div class="text-center" style="margin-bottom: 2rem;">
                            <h2 style="color:var(--color-green-success); font-size:2.5rem; text-transform:uppercase;">Protocol Passed!</h2>
                            <p style="font-weight:800; font-size:1.2rem;">Score: ${percent}% (${score}/${quizQuestions.length})</p>
                            <div style="display:flex; justify-content:center; gap:1rem; margin-top:1.5rem;">
                                <button class="btn btn-outline" onclick="location.reload()">REBOOT QUIZ</button>
                                <button class="btn btn-primary" id="downloadCertBtn">[+] DOWNLOAD CERTIFICATE</button>
                            </div>
                        </div>

                        <div class="certificate-wrapper">
                            <div id="certificateNode" class="certificate-node">
                                <div class="cert-inner">
                                    <div class="cert-header-badge">ROAD REALITY_</div>
                                    <div class="cert-title">CERTIFICATE OF ACHIEVEMENT</div>
                                    <div class="cert-text">THIS PROUDLY CERTIFIES THAT</div>
                                    
                                    <div class="cert-name">${candidateName}</div>
                                    
                                    <div class="cert-text">
                                        has successfully mastered the Road Safety & Hazard Awareness Evaluation<br>
                                        with a verified passing score of <strong>${percent}%</strong>.
                                    </div>
                                    
                                    <div class="cert-footer">
                                        <div class="cert-sig-line">
                                            DATE: <br>
                                            <span style="color:var(--color-text-muted); font-size:0.9rem;">${today}</span>
                                        </div>
                                        
                                        <div class="cert-seal">
                                            <span>VERIFIED</span>
                                            <span>SCORE: ${percent}%</span>
                                        </div>
                                        
                                        <div class="cert-sig-line">
                                            SYSTEM ADMIN<br>
                                            <span style="color:var(--color-text-muted); font-size:0.9rem;">Road Reality V1.0</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;

                    document.getElementById('downloadCertBtn').addEventListener('click', () => {
                        const btn = document.getElementById('downloadCertBtn');
                        btn.innerHTML = "GENERATING...";
                        btn.disabled = true;

                        const certNode = document.getElementById('certificateNode');
                        
                        html2canvas(certNode, { scale: 2 }).then(canvas => {
                            const link = document.createElement('a');
                            link.download = `Road_Safety_Certificate_${candidateName.replace(/\s+/g, '_')}.png`;
                            link.href = canvas.toDataURL('image/png');
                            link.click();
                            
                            btn.innerHTML = "[+] DOWNLOAD CERTIFICATE";
                            btn.disabled = false;
                        });
                    });

                } else {
                    quizResultCard.innerHTML = `
                        <div class="form-card text-center">
                            <div style="font-size: 4rem;">📖</div>
                            <h3 style="margin-top:1rem; color:var(--color-text-muted);">CANDIDATE: ${candidateName}</h3>
                            <h2 class="mt-2" style="text-transform: uppercase;">Review Required</h2>
                            <div style="font-size: 3.5rem; font-weight: 900; margin: 1rem 0; color:var(--color-red-danger);">${percent}%</div>
                            <p style="font-weight:700; font-size:1.2rem;">You need 80% to earn the certificate. (Scored ${score}/${quizQuestions.length})</p>
                            <button class="btn btn-primary mt-4" onclick="location.reload()">REBOOT QUIZ</button>
                        </div>`;
                }
            }
        });
    }
}

/* ==========================================================================
   REPORT HAZARD & DASHBOARD MAP LOGIC
   ========================================================================== */
function initReportFeature() {
    const reportForm = document.getElementById('hazardReportForm');
    if (!reportForm) return;

    const getGpsBtn = document.getElementById('getGpsBtn');
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');
    const gpsStatus = document.getElementById('gpsStatus');

    const defaultCoords = [19.5760, 74.2053];
    const map = L.map('reportMap').setView(defaultCoords, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    
    let marker = L.marker(defaultCoords, { draggable: true }).addTo(map);
    marker.bindPopup('🚨 Click map or drag marker to set exact location').openPopup();

    function updateMarker(lat, lng) {
        latInput.value = lat.toFixed(6);
        lngInput.value = lng.toFixed(6);
        marker.setLatLng([lat, lng]);
        map.setView([lat, lng], 16);
        gpsStatus.innerHTML = `✅ LOCATION LOCKED:<br>LAT: ${lat.toFixed(6)}<br>LNG: ${lng.toFixed(6)}`;
        gpsStatus.className = 'gps-status-indicator success';
    }

    marker.on('dragend', () => updateMarker(marker.getLatLng().lat, marker.getLatLng().lng));
    map.on('click', (e) => updateMarker(e.latlng.lat, e.latlng.lng));

    if (getGpsBtn) {
        getGpsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!navigator.geolocation) {
                gpsStatus.innerHTML = 'GEOLOCATION NOT SUPPORTED.';
                gpsStatus.className = 'gps-status-indicator error';
                return;
            }
            gpsStatus.textContent = 'ACQUIRING SATELLITE FIX...';
            gpsStatus.className = 'gps-status-indicator';
            
            function fetchPos(highAcc) {
                navigator.geolocation.getCurrentPosition(
                    pos => updateMarker(pos.coords.latitude, pos.coords.longitude),
                    err => {
                        if (highAcc) {
                            gpsStatus.textContent = 'HIGH ACCURACY TIMEOUT. RETRYING...';
                            fetchPos(false);
                            return;
                        }
                        gpsStatus.innerHTML = 'GPS FAILED. CLICK MAP TO OVERRIDE.';
                        gpsStatus.className = 'gps-status-indicator error';
                    },
                    { enableHighAccuracy: highAcc, timeout: 10000 }
                );
            }
            fetchPos(true);
        });
    }

    reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!latInput.value || !lngInput.value) {
            alert('CRITICAL: Location not set. Click map to set coordinates.');
            return;
        }
        const formData = new FormData(reportForm);
        const submitBtn = document.getElementById('submitReportBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'TRANSMITTING...';

        try {
            const res = await fetch('/submit-report', { method: 'POST', body: formData });
            const result = await res.json();
            if (result.success) window.location.href = result.redirect_url;
            else alert('ERROR: ' + result.message);
        } catch(err) { alert('NETWORK ERROR.'); }
        
        submitBtn.disabled = false;
        submitBtn.innerHTML = '[+] SUBMIT REPORT';
    });
}

function initDashboard() {
    if (!document.getElementById('dashboardMap')) return;
    
    const map = L.map('dashboardMap').setView([19.5760, 74.2053], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    fetch('/api/hazards').then(res => res.json()).then(hazards => {
        hazards.forEach(h => {
            const colors = { critical: '#FF3B30', high: '#FFD500', medium: '#3B82F6', low: '#00E676' };
            
            // UPDATED: Now shows the Upvote count on the Admin Dashboard map too
            L.circleMarker([h.latitude, h.longitude], {
                radius: 8, fillColor: colors[h.severity.toLowerCase()] || '#111',
                color: '#111', weight: 2, fillOpacity: 1
            }).bindPopup(`<strong style="text-transform:uppercase;">${h.hazard_type}</strong><br>SEVERITY: ${h.severity}<br>UPVOTES: ${h.upvotes || 0}`).addTo(map);
        });
    });
}