const W = 1280;
const H = 768;

const STATE = {
    coins: 0,
    stars: 0,
    energy: 100,
    mood: 100,
    unlockedRiver: false,
    unlockedMemory: false,
    best: {
        starCatch: 0,
        riverRun: 0,
        memory: 0,
    },
    outfit: { styleIndex: 0, hatIndex: 0, glassIndex: 0, colorIndex: 0 },
    fridgeItems: [],
    settings: {
        masterVolume: 0.9,
        musicVolume: 0.55,
        sfxVolume: 0.85,
        mute: false,
        showPhoneControls: true,
        highContrast: false,
        autoSave: true,
    },
};

const AUDIO_FILES = {
    background: "music/background baby.mp3",
    challenge: "music/background baby.mp3",
    gym: "music/gym.mp3",
    museum: "music/museum.mp3",
    click: "music/clicky.mp3",
    coin: "music/coiny.mp3",
    hit: "music/hitty.mp3",
    jump: "music/jumbby.mp3",
    lose: "music/losing.mp3",
    win: "music/winning.mp3",
    draw: "music/drawing.mp3",
    flush: "music/flush.mp3",
    fridge: "music/fridge.mp3",
    shower: "music/shower.mp3",
    tap: "music/soundreality-tap-water-kitchen-450989.mp3",
    toothbrush: "music/toothbrush.mp3",
    boil: "music/boilingwaterkitchen.mp3",
    cart: "music/shoppingcart.mp3",
    tvOn: "music/Tvon.mp3",
    tvOff: "music/Tvoff.mp3",
};

const SETTINGS_STORAGE_KEY = "baby-game-settings-v1";

function ensureSettingsState() {
    const defaults = {
        masterVolume: 0.9,
        musicVolume: 0.55,
        sfxVolume: 0.85,
        mute: false,
        showPhoneControls: true,
        highContrast: false,
        autoSave: true,
    };

    STATE.settings = { ...defaults, ...(STATE.settings || {}) };

    if (!STATE._settingsLoaded) {
        STATE._settingsLoaded = true;
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                STATE.settings = { ...STATE.settings, ...parsed };
            }
        } catch (_) {}
    }

    return STATE.settings;
}

function saveSettings() {
    if (!ensureSettingsState().autoSave) return;
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(STATE.settings));
    } catch (_) {}
}

function applyDisplaySettings() {
    const s = ensureSettingsState();
    const root = document.getElementById("game-container");
    if (!root) return;

    root.style.transformOrigin = "top left";
    root.style.transform = "none";
    root.style.width = `${W}px`;
    root.style.height = `${H}px`;

    root.style.filter = s.highContrast ? "contrast(1.1) saturate(1.08)" : "none";
}

function effectiveMusicVolume(baseVol = 1) {
    const s = ensureSettingsState();
    if (s.mute) return 0;
    return Phaser.Math.Clamp(baseVol * s.masterVolume * s.musicVolume, 0, 1);
}

function effectiveSfxVolume(baseVol = 1) {
    const s = ensureSettingsState();
    if (s.mute) return 0;
    return Phaser.Math.Clamp(baseVol * s.masterVolume * s.sfxVolume, 0, 1);
}

function ensureAudioState() {
    ensureSettingsState();
    if (!STATE.audio) {
        STATE.audio = {
            unlocked: false,
            bgm: null,
            bgmKey: null,
            sfxByKey: {},
        };
    }
    if (!STATE.audio.sfxByKey) {
        STATE.audio.sfxByKey = {};
    }
    return STATE.audio;
}

function unlockAudio() {
    const audio = ensureAudioState();
    if (audio.unlocked) return;
    audio.unlocked = true;
}

function playSfx(name, options = {}) {
    const src = AUDIO_FILES[name];
    if (!src) return;
    const audio = ensureAudioState();
    if (!audio.unlocked) return;

    const instanceKey = options.instanceKey || null;
    if (instanceKey && options.replaceExisting && audio.sfxByKey[instanceKey]) {
        try {
            audio.sfxByKey[instanceKey].pause();
            audio.sfxByKey[instanceKey].currentTime = 0;
        } catch (_) {}
        delete audio.sfxByKey[instanceKey];
    }

    const clip = new Audio(src);
    clip.volume = effectiveSfxVolume(options.volume ?? 0.45);
    clip.playbackRate = Phaser.Math.Clamp(options.rate ?? 1, 0.6, 1.6);
    clip.currentTime = 0;
    if (instanceKey) {
        audio.sfxByKey[instanceKey] = clip;
        clip.addEventListener("ended", () => {
            if (audio.sfxByKey[instanceKey] === clip) delete audio.sfxByKey[instanceKey];
        }, { once: true });
    }
    if (options.durationMs && options.durationMs > 0) {
        setTimeout(() => {
            try {
                clip.pause();
                clip.currentTime = 0;
            } catch (_) {}
            if (instanceKey && audio.sfxByKey[instanceKey] === clip) {
                delete audio.sfxByKey[instanceKey];
            }
        }, options.durationMs);
    }
    clip.play().catch(() => {});
    return clip;
}

function stopSfx(instanceKey) {
    if (!instanceKey) return;
    const audio = ensureAudioState();
    const clip = audio.sfxByKey?.[instanceKey];
    if (!clip) return;
    try {
        clip.pause();
        clip.currentTime = 0;
    } catch (_) {}
    delete audio.sfxByKey[instanceKey];
}

function stopBgm(fadeMs = 260) {
    const audio = ensureAudioState();
    if (!audio.bgm) return;

    const old = audio.bgm;
    const startVol = old.volume;
    const stepMs = 35;
    const steps = Math.max(1, Math.floor(fadeMs / stepMs));
    let i = 0;
    const timer = setInterval(() => {
        i += 1;
        old.volume = Math.max(0, startVol * (1 - i / steps));
        if (i >= steps) {
            clearInterval(timer);
            old.pause();
            old.src = "";
        }
    }, stepMs);

    audio.bgm = null;
    audio.bgmKey = null;
}

function setSceneMusic(kind = "background") {
    const audio = ensureAudioState();
    if (!audio.unlocked) return;

    const key = AUDIO_FILES[kind] ? kind : "background";
    const volume = kind === "challenge" ? 0.2 : kind === "gym" ? 0.24 : kind === "museum" ? 0.22 : 0.26;
    if (audio.bgm && audio.bgmKey === key) {
        audio.bgm.volume = effectiveMusicVolume(volume);
        return;
    }

    if (audio.bgm) stopBgm(220);

    const bgm = new Audio(AUDIO_FILES[key]);
    bgm.loop = true;
    bgm.volume = effectiveMusicVolume(volume);
    bgm.play().catch(() => {});
    audio.bgm = bgm;
    audio.bgmKey = key;
}

// Drawing sketch templates
const SKETCH_TEMPLATES = [
    {
        name: "Swimming",
        desc: "Crocodile swimming in river",
        guide: (scene, x, y) => {
            const c = scene.add.container(x, y);
            const g = scene.add.graphics();
            const lineColor = 0x4a6fb0;
            g.lineStyle(3, lineColor, 0.95);

            // Full scene frame and horizon.
            g.strokeRoundedRect(-326, -164, 652, 328, 18);
            g.lineBetween(-320, -76, 320, -76);

            // Clouds and sun details.
            g.strokeEllipse(-240, -118, 120, 56);
            g.strokeEllipse(-196, -122, 98, 48);
            g.strokeEllipse(208, -124, 132, 62);
            g.strokeEllipse(260, -120, 92, 44);
            g.strokeCircle(274, -52, 34);
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 * i) / 8;
                const x1 = 274 + Math.cos(angle) * 42;
                const y1 = -52 + Math.sin(angle) * 42;
                const x2 = 274 + Math.cos(angle) * 58;
                const y2 = -52 + Math.sin(angle) * 58;
                g.lineBetween(x1, y1, x2, y2);
            }

            // River banks, ripples, and reeds.
            g.strokeRoundedRect(-320, -22, 640, 180, 24);
            for (let i = 0; i < 9; i++) {
                g.strokeEllipse(-282 + i * 72, 86 + (i % 2) * 11, 56, 18);
            }
            for (let i = 0; i < 5; i++) {
                g.lineBetween(-300 + i * 18, 130, -300 + i * 18, 48 - i * 4);
                g.lineBetween(300 - i * 18, 130, 300 - i * 18, 52 - i * 5);
            }

            // Crocodile wireframe with details to color in.
            g.strokeEllipse(-16, 42, 304, 116);
            g.strokeEllipse(-168, 52, 86, 44);
            g.strokeCircle(132, 10, 54);
            g.strokeRect(176, -6, 116, 50);
            g.lineBetween(186, 26, 292, 30);
            g.strokeCircle(116, -14, 12);
            g.strokeCircle(118, -14, 4);
            g.strokeEllipse(-46, 74, 62, 28);
            g.strokeEllipse(54, 74, 62, 28);
            for (let i = 0; i < 6; i++) {
                const sx = -110 + i * 42;
                g.strokeTriangle(sx, -10, sx + 16, -36, sx + 34, -10);
            }

            c.add(g);
            return c;
        }
    },
    {
        name: "Eating",
        desc: "Crocodile eating its meal",
        guide: (scene, x, y) => {
            const c = scene.add.container(x, y);
            const g = scene.add.graphics();
            const lineColor = 0x4a6fb0;
            g.lineStyle(3, lineColor, 0.95);

            // Dining environment.
            g.strokeRoundedRect(-326, -164, 652, 328, 18);
            g.lineBetween(-320, 48, 320, 48);
            g.strokeRoundedRect(-320, 48, 640, 116, 18);
            g.strokeEllipse(-240, 0, 110, 54);
            g.strokeEllipse(240, -8, 130, 62);

            // Palm tree and picnic details.
            g.lineBetween(-272, 44, -248, -98);
            g.lineBetween(-248, -98, -224, -14);
            g.strokeEllipse(-224, -122, 92, 42);
            g.strokeEllipse(-270, -114, 88, 38);
            g.strokeEllipse(-248, -142, 84, 34);
            g.strokeRoundedRect(-90, 70, 164, 66, 14);
            g.lineBetween(-8, 70, -8, 136);
            g.lineBetween(-90, 104, 74, 104);
            g.strokeCircle(116, 96, 28);
            g.strokeCircle(116, 96, 12);
            g.strokeEllipse(188, 108, 74, 34);
            g.strokeEllipse(236, 106, 34, 20);

            // Crocodile and meal wireframe.
            g.strokeEllipse(2, 8, 270, 102);
            g.strokeEllipse(-146, 20, 72, 38);
            g.strokeCircle(120, -22, 48);
            g.strokeRect(158, -30, 112, 44);
            g.lineBetween(168, -4, 268, -2);
            g.strokeCircle(106, -38, 10);
            g.strokeCircle(108, -38, 4);
            g.strokeTriangle(264, -20, 292, -36, 292, -4);
            g.strokeEllipse(30, 38, 54, 22);
            g.strokeEllipse(-36, 38, 54, 22);
            for (let i = 0; i < 5; i++) {
                const sx = -98 + i * 38;
                g.strokeTriangle(sx, -8, sx + 14, -30, sx + 28, -8);
            }

            c.add(g);
            return c;
        }
    },
    {
        name: "Basking",
        desc: "Crocodile on land in sun",
        guide: (scene, x, y) => {
            const c = scene.add.container(x, y);
            const g = scene.add.graphics();
            const lineColor = 0x4a6fb0;
            g.lineStyle(3, lineColor, 0.95);

            // Beach scene frame and layered background.
            g.strokeRoundedRect(-326, -164, 652, 328, 18);
            g.strokeEllipse(-170, 108, 380, 120);
            g.strokeEllipse(158, 114, 364, 106);
            g.strokeRoundedRect(-320, 72, 640, 92, 20);
            g.strokeEllipse(224, 10, 188, 64);
            g.strokeEllipse(232, 12, 148, 46);

            // Sun with rays and distant hills.
            g.strokeCircle(-246, -108, 38);
            for (let i = 0; i < 10; i++) {
                const angle = (Math.PI * 2 * i) / 10;
                const x1 = -246 + Math.cos(angle) * 48;
                const y1 = -108 + Math.sin(angle) * 48;
                const x2 = -246 + Math.cos(angle) * 64;
                const y2 = -108 + Math.sin(angle) * 64;
                g.lineBetween(x1, y1, x2, y2);
            }
            g.strokeEllipse(-70, 16, 110, 38);
            g.strokeEllipse(20, 12, 122, 44);

            // Palm and rocks.
            g.lineBetween(248, 72, 216, -70);
            g.lineBetween(216, -70, 198, 18);
            g.strokeEllipse(180, -88, 84, 32);
            g.strokeEllipse(242, -92, 92, 34);
            g.strokeEllipse(214, -114, 96, 32);
            g.strokeEllipse(-262, 124, 64, 36);
            g.strokeEllipse(-214, 130, 72, 40);

            // Resting crocodile wireframe.
            g.strokeEllipse(-26, 40, 316, 92);
            g.strokeEllipse(-190, 46, 88, 40);
            g.strokeCircle(128, -2, 50);
            g.strokeRect(174, -12, 114, 44);
            g.lineBetween(182, 10, 288, 14);
            g.strokeCircle(116, -18, 10);
            g.strokeCircle(118, -18, 4);
            g.strokeEllipse(-42, 64, 64, 24);
            g.strokeEllipse(46, 64, 64, 24);
            for (let i = 0; i < 6; i++) {
                const sx = -120 + i * 40;
                g.strokeTriangle(sx, -4, sx + 14, -26, sx + 30, -4);
            }

            c.add(g);
            return c;
        }
    }
];

function sky(scene, color = 0x8fc6ff) {
    scene.add.rectangle(W / 2, H / 2, W, H, color);
    scene.add.circle(900, 90, 55, 0xffde6c);
    for (let i = 0; i < 4; i++) {
        scene.add.ellipse(120 + i * 250, 120 + (i % 2) * 20, 180, 76, 0xffffff, 0.75);
    }
    scene.add.rectangle(W / 2, 680, W, 176, 0x69d273);
}

function sparkles(scene, count = 6) {
    const icons = ["⭐", "✨", "💫"];
    for (let i = 0; i < count; i++) {
        scene.time.delayedCall(i * 300, () => {
            const t = scene.add.text(
                Phaser.Math.Between(24, W - 24),
                -20,
                Phaser.Utils.Array.GetRandom(icons),
                { fontSize: Phaser.Math.Between(22, 38) + "px" }
            ).setAlpha(0.85);

            scene.tweens.add({
                targets: t,
                y: H + 30,
                x: t.x + Phaser.Math.Between(-80, 80),
                rotation: Phaser.Math.FloatBetween(-2.2, 2.2),
                duration: Phaser.Math.Between(3500, 5500),
                onComplete: () => t.destroy(),
            });
        });
    }
}

function uiButton(scene, x, y, w, h, text, onClick, baseColor = 0xff7676, hoverColor = 0xff5252) {
    const btn = scene.add.rectangle(x, y, w, h, baseColor)
        .setStrokeStyle(4, 0xffffff)
        .setInteractive({ useHandCursor: true });

    const label = scene.add.text(x, y, text, {
        fontSize: "28px",
        color: "#ffffff",
        fontStyle: "bold",
    }).setOrigin(0.5);

    btn.on("pointerover", () => {
        btn.setFillStyle(hoverColor);
        scene.tweens.add({ targets: [btn, label], scaleX: 1.05, scaleY: 1.05, duration: 120 });
    });

    btn.on("pointerout", () => {
        btn.setFillStyle(baseColor);
        scene.tweens.add({ targets: [btn, label], scaleX: 1.0, scaleY: 1.0, duration: 120 });
    });

    btn.on("pointerdown", () => {
        unlockAudio();
        playSfx("click", { volume: 0.22, rate: 1.08 });
        onClick();
    });

    return { btn, label };
}

function createPhoneControls(scene, options = {}) {
    const settings = ensureSettingsState();
    if (!settings.showPhoneControls) {
        return {
            isDown: () => false,
            consume: () => false,
            destroy: () => {},
        };
    }

    const cfg = {
        up: false,
        e: false,
        c: false,
        q: false,
        r: false,
        p: false,
        ...options,
    };

    const state = { down: {}, pressed: {} };
    const items = [];

    const setState = (key, isDown) => {
        state.down[key] = isDown;
        if (isDown) state.pressed[key] = true;
    };

    const makeButton = (key, x, y, label, color = 0x1f2a49) => {
        const bg = scene.add.circle(x, y, 38, color, 0.72)
            .setStrokeStyle(3, 0xffffff, 0.8)
            .setDepth(480)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true });
        const txt = scene.add.text(x, y, label, {
            fontSize: "22px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(481).setScrollFactor(0);

        bg.on("pointerdown", () => setState(key, true));
        bg.on("pointerup", () => setState(key, false));
        bg.on("pointerout", () => setState(key, false));

        items.push(bg, txt);
    };

    makeButton("left", 88, H - 92, "◀");
    makeButton("right", 180, H - 92, "▶");

    if (cfg.up) makeButton("up", W - 210, H - 92, "▲", 0x27537a);
    if (cfg.e) makeButton("e", W - 110, H - 92, "E", 0x5b3e8a);
    if (cfg.c) makeButton("c", W - 110, H - 182, "C", 0x3d7f8a);
    if (cfg.q) makeButton("q", W - 210, H - 182, "Q", 0x7a5a2a);
    if (cfg.r) makeButton("r", W - 210, H - 182, "R", 0x7a4a2a);
    if (cfg.p) makeButton("p", W - 110, H - 182, "P", 0x2a7a55);

    return {
        isDown: (key) => !!state.down[key],
        consume: (key) => {
            if (!state.pressed[key]) return false;
            state.pressed[key] = false;
            return true;
        },
        destroy: () => {
            items.forEach((obj) => obj.destroy());
        }
    };
}

function addToast(scene, text, color = "#ffffff") {
    const toast = scene.add.text(W / 2, H - 30, text, {
        fontSize: "20px",
        color,
        backgroundColor: "#1c2a49",
        padding: { x: 10, y: 6 },
        fontStyle: "bold",
    }).setOrigin(0.5).setDepth(400);

    scene.tweens.add({
        targets: toast,
        y: toast.y - 30,
        alpha: 0,
        duration: 900,
        onComplete: () => toast.destroy(),
    });
}

function registerSceneCleanup(scene, cleanup) {
    let cleaned = false;
    const wrapped = () => {
        if (cleaned) return;
        cleaned = true;
        cleanup();
    };

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, wrapped);
    scene.events.once(Phaser.Scenes.Events.DESTROY, wrapped);
}

function drawCroc(scene, x, y, scale = 1) {
    const c = scene.add.container(x, y);

    // Improved crocodile design
    const body = scene.add.ellipse(0, 0, 280 * scale, 150 * scale, 0x2e8b36);
    
    // Better tail - curved/wavy appearance
    const tail1 = scene.add.ellipse(-140 * scale, 30 * scale, 100 * scale, 50 * scale, 0x2e8b36);
    const tail2 = scene.add.ellipse(-200 * scale, 50 * scale, 90 * scale, 45 * scale, 0x2e8b36);
    const tail3 = scene.add.ellipse(-250 * scale, 60 * scale, 80 * scale, 40 * scale, 0x2e8b36);
    
    // Head
    const head = scene.add.circle(145 * scale, -38 * scale, 74 * scale, 0x2e8b36);
    
    // Snout
    const snout = scene.add.rectangle(224 * scale, -35 * scale, 126 * scale, 66 * scale, 0x2e8b36);
    
    // Better teeth/mouth line
    const mouth = scene.add.line(220 * scale, -5 * scale, 0, 0, 80 * scale, 0, 0x1a5a2a)
        .setStrokeStyle(3, 0x1a5a2a);
    
    // Eyes
    const eyeW = scene.add.circle(132 * scale, -70 * scale, 14 * scale, 0xffffff);
    const eyeP = scene.add.circle(137 * scale, -70 * scale, 6 * scale, 0x000000);
    
    // Back legs (dots)
    const legL = scene.add.circle(-40 * scale, 85 * scale, 12 * scale, 0x1a5a2a);
    const legR = scene.add.circle(40 * scale, 85 * scale, 12 * scale, 0x1a5a2a);

    c.add([tail1, tail2, tail3, body, head, snout, mouth, eyeW, eyeP, legL, legR]);
    c.baseScale = scale;
    c.faceParts = { mouth, eyeW, eyeP };
    return c;
}

function setCrocFacing(croc, dir = 1) {
    if (!croc) return;
    const base = Math.abs(croc.baseScale || croc.scaleX || 1);
    croc.setScale(dir >= 0 ? base : -base, Math.abs(croc.scaleY || base));
}

function setCrocExpression(croc, expression = "neutral") {
    if (!croc || !croc.faceParts) return;
    const { mouth, eyeW, eyeP } = croc.faceParts;

    // Reset to baseline expression.
    eyeW.setScale(1, 1).setAlpha(1);
    eyeP.setScale(1, 1).setAlpha(1);
    mouth.setRotation(0).setScale(1, 1).setAlpha(1);

    if (expression === "focused") {
        eyeW.setScale(1, 0.75);
        eyeP.setScale(0.95, 0.95);
        mouth.setRotation(-0.08).setScale(1.05, 0.9);
        return;
    }

    if (expression === "strain") {
        eyeW.setScale(1, 0.68);
        eyeP.setScale(0.9, 0.9);
        mouth.setRotation(0.1).setScale(1.1, 0.85);
        return;
    }

    if (expression === "tired") {
        eyeW.setScale(1, 0.55).setAlpha(0.95);
        eyeP.setScale(0.8, 0.8).setAlpha(0.95);
        mouth.setRotation(0.16).setScale(1, 0.8);
        return;
    }

    if (expression === "happy") {
        eyeW.setScale(1, 1.05);
        mouth.setRotation(-0.18).setScale(1.05, 1);
    }
}

function setCrocBlink(croc, closed = false) {
    if (!croc || !croc.faceParts) return;
    const { eyeW, eyeP } = croc.faceParts;
    if (closed) {
        eyeW.setScale(1, 0.18);
        eyeP.setAlpha(0);
    } else {
        eyeP.setAlpha(1);
    }
}

function drawBear(scene, x, y, scale = 1) {
    const c = scene.add.container(x, y);

    const bodyPivot = scene.add.container(0, 0);
    const body = scene.add.ellipse(0, 0, 170 * scale, 130 * scale, 0x8d6e63);
    const belly = scene.add.ellipse(0, 12 * scale, 90 * scale, 70 * scale, 0xa98274);
    const shoulderL = scene.add.ellipse(-58 * scale, -6 * scale, 26 * scale, 62 * scale, 0x7a5d52);
    const shoulderR = scene.add.ellipse(58 * scale, -6 * scale, 26 * scale, 62 * scale, 0x7a5d52);
    bodyPivot.add([body, belly, shoulderL, shoulderR]);

    const head = scene.add.circle(0, -78 * scale, 54 * scale, 0x8d6e63);
    const earL = scene.add.circle(-34 * scale, -116 * scale, 14 * scale, 0x8d6e63);
    const earR = scene.add.circle(34 * scale, -116 * scale, 14 * scale, 0x8d6e63);
    const eyeL = scene.add.circle(-16 * scale, -82 * scale, 4 * scale, 0x000000);
    const eyeR = scene.add.circle(16 * scale, -82 * scale, 4 * scale, 0x000000);
    const snout = scene.add.ellipse(0, -62 * scale, 34 * scale, 24 * scale, 0xc7a28f);
    const nose = scene.add.circle(0, -64 * scale, 4 * scale, 0x1a1a1a);
    const mouth = scene.add.ellipse(0, -48 * scale, 16 * scale, 6 * scale, 0x5a3a2a);

    const legPivotL = scene.add.container(-34 * scale, 34 * scale);
    const legPivotR = scene.add.container(34 * scale, 34 * scale);
    const thighL = scene.add.ellipse(0, 14 * scale, 30 * scale, 42 * scale, 0x6d4c41);
    const shinL = scene.add.ellipse(0, 40 * scale, 24 * scale, 34 * scale, 0x5d4037);
    const footL = scene.add.ellipse(0, 58 * scale, 28 * scale, 12 * scale, 0x4a3029);
    const thighR = scene.add.ellipse(0, 14 * scale, 30 * scale, 42 * scale, 0x6d4c41);
    const shinR = scene.add.ellipse(0, 40 * scale, 24 * scale, 34 * scale, 0x5d4037);
    const footR = scene.add.ellipse(0, 58 * scale, 28 * scale, 12 * scale, 0x4a3029);
    legPivotL.add([thighL, shinL, footL]);
    legPivotR.add([thighR, shinR, footR]);

    c.add([bodyPivot, legPivotL, legPivotR, head, earL, earR, eyeL, eyeR, snout, nose, mouth]);
    c.bearParts = { bodyPivot, legPivotL, legPivotR, head, earL, earR, mouth, nose };
    return c;
}

function drawPanda(scene, x, y, scale = 1) {
    const c = scene.add.container(x, y);

    const body = scene.add.ellipse(-6 * scale, 0, 172 * scale, 108 * scale, 0xffffff);
    const backPatch = scene.add.ellipse(-34 * scale, -4 * scale, 74 * scale, 54 * scale, 0x202226, 0.95);
    const tail = scene.add.ellipse(-106 * scale, -8 * scale, 68 * scale, 36 * scale, 0x202226).setAngle(18);
    const legL = scene.add.ellipse(-34 * scale, 44 * scale, 24 * scale, 54 * scale, 0x202226);
    const legR = scene.add.ellipse(12 * scale, 44 * scale, 24 * scale, 54 * scale, 0x202226);
    const pawL = scene.add.ellipse(-34 * scale, 68 * scale, 20 * scale, 10 * scale, 0x131417, 0.7);
    const pawR = scene.add.ellipse(12 * scale, 68 * scale, 20 * scale, 10 * scale, 0x131417, 0.7);

    const head = scene.add.circle(88 * scale, -38 * scale, 48 * scale, 0xffffff);
    const earL = scene.add.circle(58 * scale, -78 * scale, 14 * scale, 0x202226);
    const earR = scene.add.circle(116 * scale, -82 * scale, 14 * scale, 0x202226);
    const eyePatchL = scene.add.ellipse(72 * scale, -42 * scale, 20 * scale, 14 * scale, 0x202226);
    const eyePatchR = scene.add.ellipse(104 * scale, -44 * scale, 20 * scale, 14 * scale, 0x202226);
    const eyeL = scene.add.circle(74 * scale, -42 * scale, 3 * scale, 0xffffff);
    const eyeR = scene.add.circle(102 * scale, -44 * scale, 3 * scale, 0xffffff);
    const nose = scene.add.circle(90 * scale, -26 * scale, 4 * scale, 0x111111);
    const muzzle = scene.add.ellipse(90 * scale, -22 * scale, 22 * scale, 16 * scale, 0xf2f2f2);

    c.add([
        tail,
        body, backPatch,
        legL, legR, pawL, pawR,
        head, muzzle, nose,
        earL, earR,
        eyePatchL, eyePatchR,
        eyeL, eyeR,
    ]);
    return c;
}

function drawTurtle(scene, x, y, scale = 1) {
    const c = scene.add.container(x, y);
    const shell = scene.add.ellipse(0, 0, 120 * scale, 88 * scale, 0x4e8b57).setStrokeStyle(4, 0x305c38);
    const shellPattern1 = scene.add.circle(0, 0, 18 * scale, 0x74b56f);
    const shellPattern2 = scene.add.circle(-24 * scale, 4 * scale, 14 * scale, 0x74b56f);
    const shellPattern3 = scene.add.circle(24 * scale, 4 * scale, 14 * scale, 0x74b56f);
    const head = scene.add.circle(68 * scale, -4 * scale, 20 * scale, 0x7fc97b);
    const eye = scene.add.circle(74 * scale, -8 * scale, 3 * scale, 0x111111);
    const legL1 = scene.add.ellipse(-34 * scale, 34 * scale, 24 * scale, 16 * scale, 0x7fc97b);
    const legL2 = scene.add.ellipse(12 * scale, 34 * scale, 24 * scale, 16 * scale, 0x7fc97b);
    const legR1 = scene.add.ellipse(-34 * scale, -34 * scale, 24 * scale, 16 * scale, 0x7fc97b);
    const legR2 = scene.add.ellipse(12 * scale, -34 * scale, 24 * scale, 16 * scale, 0x7fc97b);
    const tail = scene.add.triangle(-70 * scale, 0, -8 * scale, 0, 8 * scale, -8 * scale, 8 * scale, 8 * scale, 0x7fc97b);
    c.add([tail, shell, shellPattern1, shellPattern2, shellPattern3, head, eye, legL1, legL2, legR1, legR2]);
    return c;
}

function drawDuck(scene, x, y
    , scale = 1) {
    const c = scene.add.container(x, y);
    const body = scene.add.ellipse(0, 0, 90 * scale, 58 * scale, 0xffdd67);
    const wing = scene.add.ellipse(-8 * scale, 0, 38 * scale, 26 * scale, 0xf1c84a);
    const head = scene.add.circle(34 * scale, -26 * scale, 22 * scale, 0xffdd67);
    const beak = scene.add.polygon(58 * scale, -24 * scale, [
        { x: 0, y: 0 },
        { x: 18 * scale, y: 6 * scale },
        { x: 0, y: 12 * scale },
    ], 0xff8f3f);
    const eye = scene.add.circle(38 * scale, -30 * scale, 3 * scale, 0x111111);
    const footL = scene.add.rectangle(-10 * scale, 34 * scale, 4 * scale, 20 * scale, 0xff8f3f);
    const footR = scene.add.rectangle(16 * scale, 34 * scale, 4 * scale, 20 * scale, 0xff8f3f);
    const webL = scene.add.ellipse(-10 * scale, 44 * scale, 18 * scale, 8 * scale, 0xff8f3f);
    const webR = scene.add.ellipse(16 * scale, 44 * scale, 18 * scale, 8 * scale, 0xff8f3f);
    c.add([body, wing, head, beak, eye, footL, footR, webL, webR]);
    return c;
}

function drawFish(scene, x, y, scale = 1) {
    const c = scene.add.container(x, y);
    const body = scene.add.ellipse(0, 0, 100 * scale, 52 * scale, 0x58b7ff);
    const belly = scene.add.ellipse(4 * scale, 10 * scale, 62 * scale, 22 * scale, 0xa7ddff, 0.9);
    const tail = scene.add.triangle(-58 * scale, 0, -8 * scale, 0, 24 * scale, -22 * scale, 24 * scale, 22 * scale, 0x2c7cc9);
    const finTop = scene.add.triangle(-6 * scale, -20 * scale, -6 * scale, 0, 12 * scale, 0, 3 * scale, -22 * scale, 0x2c7cc9);
    const finBottom = scene.add.triangle(0, 18 * scale, -6 * scale, 0, 12 * scale, 0, 3 * scale, 20 * scale, 0x2c7cc9);
    const eye = scene.add.circle(28 * scale, -4 * scale, 4 * scale, 0xffffff);
    const pupil = scene.add.circle(30 * scale, -4 * scale, 2 * scale, 0x111111);
    c.add([tail, body, belly, finTop, finBottom, eye, pupil]);
    return c;
}

function createAnimalDisplay(scene, animalKey, x, y, scale = 1) {
    if (animalKey === "croc") return drawCroc(scene, x, y + 8, 0.24 * scale);
    if (animalKey === "bear") return drawBear(scene, x, y + 14, 0.52 * scale);
    if (animalKey === "panda") return drawPanda(scene, x - 8, y + 12, 0.5 * scale);
    if (animalKey === "turtle") return drawTurtle(scene, x, y + 8, 0.62 * scale);
    if (animalKey === "duck") return drawDuck(scene, x, y + 6, 0.62 * scale);
    if (animalKey === "fish") return drawFish(scene, x, y + 10, 0.7 * scale);
    return drawCroc(scene, x, y + 8, 0.24 * scale);
}

function createSkyCoin(scene, x, y) {
    const coin = scene.add.container(x, y).setDepth(14);
    const rim = scene.add.circle(0, 0, 22, 0xffe07a).setStrokeStyle(4, 0xfff8cf);
    const core = scene.add.circle(0, 0, 16, 0xffbf2f);
    const shine = scene.add.ellipse(-7, -7, 10, 18, 0xffffff, 0.45).setAngle(20);
    const stamp = scene.add.text(0, 0, "C", {
        fontSize: "20px",
        color: "#8c5a00",
        fontStyle: "bold",
    }).setOrigin(0.5);
    coin.add([rim, core, shine, stamp]);
    scene.physics.add.existing(coin);
    coin.body.setAllowGravity(false);
    coin.body.setSize(44, 44, true);
    coin.collected = false;
    coin.spinPhase = Phaser.Math.FloatBetween(0, Math.PI * 2);
    coin.spinFreq = Phaser.Math.FloatBetween(0.0042, 0.0054);
    coin.rollFreq = Phaser.Math.FloatBetween(0.0072, 0.0086);
    coin.shine = shine;
    return coin;
}

class WelcomeScene extends Phaser.Scene {
    constructor() {
        super("WelcomeScene");
    }

    create() {
        applyDisplaySettings();
        setSceneMusic("background");
        sky(this, 0x6d8ee8);
        sparkles(this, 12);

        this.add.text(W / 2, 122, "CROC PLAYTIME", {
            fontSize: "74px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#1d2a63",
            strokeThickness: 8,
        }).setOrigin(0.5);

        this.add.text(W / 2, 198, "A big adventure with your crocodile", {
            fontSize: "34px",
            color: "#ffec8d",
            fontStyle: "bold",
        }).setOrigin(0.5);

        const croc = drawCroc(this, W / 2 - 20, 400, 1.45);
        this.tweens.add({ targets: croc, y: croc.y - 10, yoyo: true, repeat: -1, duration: 900 });

        uiButton(this, W / 2, 640, 340, 92, "START GAME", () => this.scene.start("HubScene"));
    }
}

class HubScene extends Phaser.Scene {
    constructor() {
        super("HubScene");
    }

    create() {
        setSceneMusic("background");
        this.sceneTransitionLocked = false;
        sky(this, 0x7eb6ff);
        
        // Add floating stars in background for ambiance
        for (let i = 0; i < 15; i++) {
            const star = this.add.text(
                Phaser.Math.Between(50, W - 50),
                Phaser.Math.Between(200, H - 100),
                "⭐",
                { fontSize: Phaser.Math.Between(16, 32) + "px", alpha: 0.4 }
            ).setDepth(-1);
            
            this.tweens.add({
                targets: star,
                y: star.y - Phaser.Math.Between(30, 60),
                alpha: 0.1,
                duration: Phaser.Math.Between(2000, 4000),
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }

        this.add.text(W / 2, 62, "CROC DASHBOARD", {
            fontSize: "56px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#223570",
            strokeThickness: 6,
        }).setOrigin(0.5);

        const topPanel = this.add.rectangle(W / 2, 128, 1200, 96, 0x20408f, 0.35).setStrokeStyle(3, 0xffffff, 0.65);
        this.tweens.add({ targets: topPanel, alpha: 0.55, yoyo: true, repeat: -1, duration: 1800 });

        this.add.text(90, 100, `Coins: ${STATE.coins}`, { fontSize: "28px", color: "#fff5a0", fontStyle: "bold" });
        this.add.text(90, 132, `Stars: ${STATE.stars}`, { fontSize: "24px", color: "#ffffff", fontStyle: "bold" });
        this.add.text(350, 100, `Mood: ${STATE.mood}%`, { fontSize: "24px", color: "#ffffff", fontStyle: "bold" });
        this.add.text(350, 132, `Energy: ${STATE.energy}%`, { fontSize: "24px", color: "#ffffff", fontStyle: "bold" });

        this.add.text(650, 95, `Best Sky Dash: ${STATE.best.starCatch}`, { fontSize: "20px", color: "#ffffff" });
        this.add.text(650, 122, `Best River Run: ${STATE.best.riverRun}`, { fontSize: "20px", color: "#ffffff" });
        this.add.text(650, 149, `Best Memory: ${STATE.best.memory}`, { fontSize: "20px", color: "#ffffff" });

        this.createChallengeCard(200, 315, "SKY DASH", "Jump platforms & collect coins!", true, "StarCatchScene", 0xffc86a);
        this.createChallengeCard(640, 315, "RIVER RUN", "Jump logs + dodge birds", true, "RiverRunScene", 0x7bd8ff);
        this.createChallengeCard(1080, 315, "MEMORY FUN", "Match crocodile cards", true, "MemoryScene", 0xd8a0ff);

        this.createActivityTab(150, 530, "DRAW", "DrawScene", 0xff8ea3, 150, 80, 24);
        this.createActivityTab(320, 530, "SHOP", "ShopScene", 0xffd472, 150, 80, 24);
        //this.createActivityTab(470, 530, "WORKOUT", "WorkoutScene", 0x83e39f, 160, 80, 24);
        this.createActivityTab(490, 530, "TV", "TVScene", 0x9db4ff, 140, 80, 24);
        this.createActivityTab(670, 530, "KITCHEN", "KitchenScene", 0xffb784, 170, 80, 24);
        this.createActivityTab(870, 530, "BEDROOM", "BedroomScene", 0xc8a7ff, 170, 80, 24);
        this.createActivityTab(1060, 530, "LIBRARY", "LibraryScene", 0xc2b7a2, 160, 80, 24);

        this.createActivityTab(150, 640, "MUSEUM", "MuseumScene", 0x8dd1c7, 170, 80, 24);
        this.createActivityTab(350, 640, "BATHROOM", "ToiletScene", 0x8fe0ff, 180, 80, 24);
        this.createActivityTab(560, 640, "SETTINGS", "SettingsScene", 0xa3d5ff, 180, 80, 24);
        this.createActivityTab(770, 640, "CREDITS", "CreditsScene", 0x7ec8b3, 170, 80, 24);

        uiButton(this, 1080, 640, 220, 68, "WELCOME", () => this.scene.start("WelcomeScene"), 0xff8c8c, 0xff5f5f);
    }

    createChallengeCard(x, y, title, subtitle, unlocked, sceneName, color) {
        const card = this.add.rectangle(x, y, 300, 240, color).setStrokeStyle(5, 0xffffff).setInteractive({ useHandCursor: true });
        if (!unlocked) card.setAlpha(0.45);
        
        // Add subtle floating animation
        this.tweens.add({
            targets: card,
            y: y - 8,
            duration: 2000 + Phaser.Math.Between(-400, 400),
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        const titleText = this.add.text(x, y - 64, title, {
            fontSize: "36px",
            color: "#26366e",
            fontStyle: "bold",
            align: "center",
        }).setOrigin(0.5);
        
        // Sync title with card
        this.tweens.add({
            targets: titleText,
            y: (y - 64) - 8,
            duration: 2000 + Phaser.Math.Between(-400, 400),
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.add.text(x, y - 6, subtitle, {
            fontSize: "22px",
            color: "#222222",
            align: "center",
            wordWrap: { width: 260 },
        }).setOrigin(0.5);

        const playText = this.add.text(x, y + 74, unlocked ? "PLAY" : "LOCKED", {
            fontSize: "38px",
            color: unlocked ? "#ffffff" : "#2f2f2f",
            fontStyle: "bold",
        }).setOrigin(0.5);

        card.on("pointerover", () => {
            if (!unlocked) return;
            this.tweens.add({ targets: [card, titleText, playText], scale: 1.04, duration: 120 });
            card.setStrokeStyle(7, 0xfff1a4);
        });

        card.on("pointerout", () => {
            this.tweens.add({ targets: [card, titleText, playText], scale: 1.0, duration: 120 });
            card.setStrokeStyle(5, 0xffffff);
        });

        card.on("pointerdown", () => {
            if (unlocked) {
                this.scene.start(sceneName);
                return;
            }
            const m = this.add.text(x, y + 108, "Finish previous challenge first", {
                fontSize: "17px",
                color: "#ffffff",
                backgroundColor: "#000000",
                padding: { x: 8, y: 5 },
            }).setOrigin(0.5);
            this.tweens.add({
                targets: m,
                y: m.y - 20,
                alpha: 0,
                duration: 1200,
                onComplete: () => m.destroy(),
            });
        });
    }

    createActivityTab(x, y, label, sceneName, color, width = 165, height = 94, fontSize = 30) {
        const tab = this.add.rectangle(x, y, width, height, color)
            .setStrokeStyle(4, 0xffffff)
            .setInteractive({ useHandCursor: true });
        
        const txt = this.add.text(x, y, label, {
            fontSize: `${fontSize}px`,
            color: "#1f2f66",
            fontStyle: "bold",
        }).setOrigin(0.5);

        tab.on("pointerover", () => {
            this.tweens.add({ targets: [tab, txt], scaleX: 1.06, scaleY: 1.06, duration: 110 });
            tab.setStrokeStyle(6, 0xfff3b0);
        });

        tab.on("pointerout", () => {
            this.tweens.add({ targets: [tab, txt], scaleX: 1.0, scaleY: 1.0, duration: 110 });
            tab.setStrokeStyle(4, 0xffffff);
        });

        const navigateToScene = () => {
            if (this.sceneTransitionLocked) return;
            this.sceneTransitionLocked = true;
            console.log(`Navigating to ${sceneName}`);
            this.scene.start(sceneName);
        };

        tab.on("pointerdown", navigateToScene);

        // Make the text clickable too so click is reliable even when user taps directly on letters.
        txt.setInteractive({ useHandCursor: true });
        txt.on("pointerdown", () => {
            navigateToScene();
        });
    }
}

class StarCatchScene extends Phaser.Scene {
    constructor() {
        super("StarCatchScene");
    }

    create() {
        setSceneMusic("challenge");
        this.worldWidth = 20000; // Longer track to support 60-platform run

        // Sky gradient background
        this.add.rectangle(this.worldWidth / 2, H / 2, this.worldWidth, H, 0x87ceeb).setDepth(-20);
        this.add.rectangle(this.worldWidth / 2, H - 22, this.worldWidth, 110, 0x458d4c).setDepth(-19);
        const clouds = this.add.graphics();
        for (let i = 0; i < 34; i++) {
            clouds.fillStyle(0xffffff, 0.7);
            clouds.fillCircle(Phaser.Math.Between(0, this.worldWidth), Phaser.Math.Between(50, 300), Phaser.Math.Between(40, 80));
        }

        this.score = 0;
        this.runMoney = 0;
        this.platformsPassed = 0;
        this.targetPlatforms = 60;
        this.trophyReady = false;
        this.ended = false;
        this.finishing = false;
        this.timeLeft = 135;
        this.invincible = false;
        this.health = 100;
        this.jumpCount = 0;

        this.add.text(W / 2, 42, "🌟 SKY DASH 🌟", {
            fontSize: "56px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#ff6b35",
            strokeThickness: 6,
        }).setOrigin(0.5);

        this.add.text(W / 2, 88, "Land on 60 platforms to score. Coins are separate money.", {
            fontSize: "20px",
            color: "#fff4a3",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 2,
        }).setOrigin(0.5).setScrollFactor(0);

        this.healthHint = this.add.text(W - 32, 210, "Avoid eagles!", {
            fontSize: "18px",
            color: "#fff0a0",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 2,
        }).setOrigin(1, 0).setScrollFactor(0);

        // UI
        this.scoreText = this.add.text(38, 120, "Score: 0", { fontSize: "28px", color: "#ffffff", fontStyle: "bold", stroke: "#000000", strokeThickness: 3 }).setScrollFactor(0);
        this.platformText = this.add.text(38, 152, `Platforms: 0/${this.targetPlatforms}`, { fontSize: "22px", color: "#ffed4e", fontStyle: "bold", stroke: "#000000", strokeThickness: 2 }).setScrollFactor(0);
        this.moneyText = this.add.text(38, 180, "Money: $0", { fontSize: "20px", color: "#ff9f43", fontStyle: "bold", stroke: "#000000", strokeThickness: 2 }).setScrollFactor(0);
        this.timerText = this.add.text(W - 38, 120, `Time: ${this.timeLeft}s`, { fontSize: "26px", color: "#ff6b6b", fontStyle: "bold", stroke: "#000000", strokeThickness: 3 }).setOrigin(1, 0).setScrollFactor(0);
        this.healthLabel = this.add.text(W - 38, 154, "Health", {
            fontSize: "20px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 3,
        }).setOrigin(1, 0).setScrollFactor(0);
        this.healthBarBg = this.add.rectangle(W - 210, 188, 170, 18, 0x3b1e1e, 0.95)
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setStrokeStyle(2, 0xffffff);
        this.healthBarFill = this.add.rectangle(W - 208, 188, 166, 12, 0x59d66a)
            .setOrigin(0, 0.5)
            .setScrollFactor(0);
        this.updateHealthBar();

        // Crocodile player
        this.player = drawCroc(this, 220, 540, 0.7);
        this.physics.add.existing(this.player);
        this.player.body.setGravityY(1400);
        // Centered feet-focused hitbox to avoid floating/side-sticking glitches.
        this.player.body.setSize(190, 72, true);
        this.player.body.setBounce(0);
        this.player.body.setCollideWorldBounds(true);
        this.player.setDepth(10);

        // True side-scroller world and camera setup.
        this.trophyX = this.worldWidth - 240;
        this.autoRunSpeed = 0;
        this.physics.world.setBounds(0, 0, this.worldWidth, H + 260);
        this.cameras.main.setBounds(0, 0, this.worldWidth, H);
        this.cameras.main.setBackgroundColor(0x87ceeb);
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -W * 0.25, 100);

        this.trophy = this.add.text(this.trophyX, 370, "🏆", {
            fontSize: "120px"
        }).setOrigin(0.5).setDepth(25);
        this.physics.add.existing(this.trophy);
        this.trophy.body.setAllowGravity(false);
        this.trophy.body.setSize(95, 95, true);
        this.trophy.setVisible(false);

        // Controls
        this.keys = this.input.keyboard.addKeys({
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            up: Phaser.Input.Keyboard.KeyCodes.SPACE,
            arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
            arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
            arrowUp: Phaser.Input.Keyboard.KeyCodes.UP,
        });
        this.phoneControls = createPhoneControls(this, { up: true });

        // Platform groups
        this.platforms = this.physics.add.staticGroup();
        this.movingPlatforms = this.physics.add.staticGroup();
        this.coins = this.physics.add.group();
        this.obstacles = this.physics.add.group();
        this.eagles = this.physics.add.group();

        // Starting platform
        const startPlatform = this.add.rectangle(220, 620, 260, 24, 0x2ecc71).setStrokeStyle(3, 0x27ae60);
        this.physics.add.existing(startPlatform, true);
        this.platforms.add(startPlatform);

        // Generate initial platforms ahead of player
        this.nextPlatformX = 520;
        for (let i = 0; i < 12; i++) {
            this.spawnPlatform();
        }

        // Collisions
        this.physics.add.collider(
            this.player,
            this.platforms,
            (player, platform) => this.handlePlatformLanding(player, platform),
            (player, platform) => this.canStandOnPlatform(player, platform),
            this
        );

        this.physics.add.collider(this.player, this.movingPlatforms, (player, platform) => {
            // Carry the player with moving blocks while standing on top.
            if (player.body.touching.down && platform.deltaX) {
                player.x += platform.deltaX;
            }
            this.handlePlatformLanding(player, platform);
        }, (player, platform) => this.canStandOnPlatform(player, platform), this);

        this.physics.add.overlap(this.player, this.coins, (player, coin) => {
            if (coin.collected) return;
            coin.collected = true;
            playSfx("coin", { volume: 0.36, rate: 1.1 });

            const money = 5;
            this.runMoney += money;
            this.moneyText.setText(`Money: $${this.runMoney}`);
            
            // Coin collect animation with sparkle effects
            this.tweens.add({
                targets: coin,
                y: coin.y - 80,
                alpha: 0,
                scale: 1.8,
                duration: 400,
                ease: 'Power2',
                onComplete: () => coin.destroy()
            });
            
            // Add sparkles
            for (let i = 0; i < 8; i++) {
                const sparkle = this.add.text(
                    coin.x + Phaser.Math.Between(-25, 25),
                    coin.y + Phaser.Math.Between(-25, 25),
                    "✨",
                    { fontSize: "20px" }
                ).setDepth(99);
                
                this.tweens.add({
                    targets: sparkle,
                    alpha: 0,
                    y: sparkle.y - 40,
                    rotation: Phaser.Math.Between(-1, 1),
                    duration: 700,
                    onComplete: () => sparkle.destroy()
                });
            }

            // Score popup
            const popup = this.add.text(coin.x, coin.y, `+$${money}`, {
                fontSize: "28px",
                color: "#ffd700",
                fontStyle: "bold",
                stroke: "#ff6b35",
                strokeThickness: 4
            }).setOrigin(0.5).setDepth(100);
            this.tweens.add({
                targets: popup,
                y: popup.y - 60,
                alpha: 0,
                duration: 1000,
                onComplete: () => popup.destroy()
            });
        });

        this.physics.add.overlap(this.player, this.obstacles, (player, obstacle) => {
            if (this.invincible || this.ended) return;
            
            // Check if player is jumping over the obstacle
            const playerBottom = player.body.y + player.body.height;
            const obstacleTop = obstacle.body.y;
            const jumpClearance = 30; // Pixels of clearance needed to jump over
            
            // If player's bottom is above obstacle's top by clearance amount, they jumped over it!
            if (playerBottom < obstacleTop - jumpClearance) {
                if (!obstacle.wasJumpedOver) {
                    obstacle.wasJumpedOver = true;
                    this.successfulJump(obstacle);
                }
                return;
            }
            
            // Otherwise, player hit the obstacle
            if (!obstacle.hasHit) {
                obstacle.hasHit = true;
                this.hitObstacle(obstacle);
            }
        });

        this.physics.add.overlap(this.player, this.eagles, (player, eagle) => {
            if (this.invincible || this.ended || eagle.hasHit) return;
            eagle.hasHit = true;
            this.hitObstacle(eagle);
        });

        this.physics.add.overlap(this.player, this.trophy, () => {
            if (!this.finishing && this.trophyReady && this.trophy.visible) {
                this.collectTrophyAndWin();
            }
        });

        // Timer
        this.timerEvent = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => {
                if (this.ended || this.finishing) return;
                this.timeLeft--;
                this.timerText.setText(`Time: ${this.timeLeft}s`);
                if (this.timeLeft <= 0) {
                    this.gameOver();
                }
            }
        });

        // Spawn obstacles periodically
        this.obstacleSpawnEvent = this.time.addEvent({
            delay: 2800,
            loop: true,
            callback: () => {
                if (!this.ended) this.spawnObstacle();
            }
        });

        this.eagleSpawnEvent = this.time.addEvent({
            delay: 2100,
            loop: true,
            callback: () => {
                if (!this.ended) this.spawnEagle();
            }
        });

        const homeBtn = uiButton(this, W - 100, 44, 170, 52, "HOME", () => this.scene.start("HubScene"), 0xff7d7d, 0xff5858);
        homeBtn.btn.setScrollFactor(0);
        homeBtn.label.setScrollFactor(0);

        registerSceneCleanup(this, () => this.cleanupRuntime());
    }

    update() {
        if (this.ended || this.finishing) return;

        if (this.player.body.touching.down || this.player.body.blocked.down) {
            this.jumpCount = 0;
        }

        if (Phaser.Input.Keyboard.JustDown(this.keys.up) || Phaser.Input.Keyboard.JustDown(this.keys.arrowUp) || this.phoneControls.consume("up")) {
            this.jump();
        }
        
        // Keep player upright unless dead
        if (this.player.angle !== 0 && this.health > 0) {
            this.player.angle = 0;
            this.player.scaleX = 0.7;
            this.player.scaleY = 0.7;
        }

        // Horizontal movement
        const moveSpeed = 190;
        let vx = this.autoRunSpeed;
        if (this.keys.left.isDown || this.keys.arrowLeft.isDown || this.phoneControls.isDown("left")) {
            vx -= moveSpeed;
        }
        if (this.keys.right.isDown || this.keys.arrowRight.isDown || this.phoneControls.isDown("right")) {
            vx += moveSpeed;
        }
        this.player.body.setVelocityX(vx);

        // Update moving platforms and spawn new ones ahead of camera.
        this.movingPlatforms.getChildren().forEach(platform => {
            if (platform.active) {
                const prevX = platform.x;
                if (platform.moveAmp) {
                    platform.x = platform.baseX + Math.sin(this.time.now * platform.moveFreq + platform.movePhase) * platform.moveAmp;
                }
                platform.deltaX = platform.x - prevX;
                platform.body.updateFromGameObject();
                if (platform.x < this.cameras.main.scrollX - 260) {
                    platform.destroy();
                }
            }
        });

        this.platforms.getChildren().forEach(platform => {
            if (platform.active && platform !== this.finalPlatform && platform.x < this.cameras.main.scrollX - 260) {
                platform.destroy();
            }
        });

        // Spawn platforms more aggressively to ensure we get 40+ platforms
        while (this.nextPlatformX < this.player.x + W * 1.5 && this.nextPlatformX < this.trophyX - 100) {
            this.spawnPlatform();
        }

        // Keep moving obstacles active.
        this.coins.getChildren().forEach(coin => {
            if (coin.active) {
                if (coin.collected) {
                    return;
                }
                const spin = this.time.now * coin.spinFreq + coin.spinPhase;
                const roll = Math.sin(this.time.now * coin.rollFreq + coin.spinPhase);
                coin.rotation = spin;
                coin.scaleX = 0.75 + Math.abs(roll) * 0.27;
                coin.scaleY = 0.96;
                if (coin.shine) {
                    coin.shine.alpha = 0.22 + Math.abs(roll) * 0.58;
                    coin.shine.x = -8 + roll * 6;
                }
                coin.body.updateFromGameObject();
                if (coin.x < this.cameras.main.scrollX - 80) coin.destroy();
            }
        });

        // Move obstacles
        this.obstacles.getChildren().forEach(obs => {
            if (obs.active) {
                obs.x -= obs.speed;
                obs.angle += obs.spinSpeed;
                obs.body.updateFromGameObject();
                if (obs.x < this.cameras.main.scrollX - 120) obs.destroy();
            }
        });

        // Move eagle hazards - fly straight, no bobbing
        this.eagles.getChildren().forEach(eagle => {
            if (eagle.active) {
                eagle.x -= eagle.speed;
                eagle.body.updateFromGameObject();
                if (eagle.x < this.cameras.main.scrollX - 120) eagle.destroy();
            }
        });

        // Missing a platform now respawns instead of failing the whole run.
        if (this.player.y > H + 160) {
            this.player.body.setVelocity(0, 0);
            this.player.x = Math.max(140, this.player.x - 260);
            this.player.y = 360;
            addToast(this, "Missed platform! Back in race", "#ffd2d2");
            this.updateHealthBar();
        }

        // Safety fallback: reveal trophy near end even if one platform did not get counted.
        if (!this.trophyReady && this.player.x >= this.trophyX - 360) {
            this.revealTrophy();
        }

        // Touch trophy to win after clearing all required platforms.
        if (!this.finishing && this.trophyReady && this.trophy.visible) {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.trophy.x, this.trophy.y);
            if (dist < 100) {
                this.collectTrophyAndWin();
            }
        }
    }

    cleanupRuntime() {
        if (this.timerEvent) this.timerEvent.remove(false);
        if (this.obstacleSpawnEvent) this.obstacleSpawnEvent.remove(false);
        if (this.eagleSpawnEvent) this.eagleSpawnEvent.remove(false);
        this.tweens.killAll();
    }

    jump() {
        if (this.ended) return;

        const grounded = this.player.body.touching.down || this.player.body.blocked.down;
        if (grounded) {
            this.jumpCount = 0;
        }
        if (this.jumpCount >= 2) return;

        this.player.body.setVelocityY(-720);
        this.jumpCount += 1;
        playSfx("jump", { volume: 0.34, rate: 1.05 });

        this.tweens.add({
            targets: this.player,
            scaleY: 0.65,
            scaleX: 0.8,
            duration: 100,
            yoyo: true,
            ease: 'Sine.easeOut'
        });
    }

    handlePlatformLanding(player, platform) {
        if (this.ended || this.finishing || !platform || !platform.active) return;
        if (platform.counted) return;

        const landingFromAbove = (player.body.touching.down || player.body.blocked.down) && player.body.velocity.y >= -10;
        if (!landingFromAbove) return;

        platform.counted = true;
        this.platformsPassed++;
        this.score = this.platformsPassed;
        this.platformText.setText(`Platforms: ${this.platformsPassed}/${this.targetPlatforms}`);
        this.scoreText.setText(`Score: ${this.score}`);

        this.tweens.add({
            targets: platform,
            alpha: 0.3,
            yoyo: true,
            duration: 100,
            repeat: 1,
        });

        if (this.platformsPassed >= this.targetPlatforms && !this.trophyReady) {
            this.revealTrophy();
        }
    }

    spawnPlatform() {
        if (this.ended) return;

        const y = Phaser.Math.Between(380, 620);
        const width = Phaser.Math.Between(130, 205);
        const height = 22;
        
        // Random platform type
        const type = Phaser.Math.Between(1, 100);
        let color, speed;
        
        if (type > 72) {
            // Moving side platform
            color = 0xe74c3c;
            speed = 1;
        } else if (type > 45) {
            // Stable medium platform
            color = 0x3498db;
            speed = 0;
        } else {
            // Stable easy platform
            color = 0x2ecc71;
            speed = 0;
        }

        const platform = this.add.rectangle(this.nextPlatformX, y, width, height, color)
            .setStrokeStyle(3, 0xffffff);
        this.physics.add.existing(platform, true);
        platform.speed = speed;
        platform.baseX = this.nextPlatformX;
        if (speed > 0) {
            platform.moveAmp = Phaser.Math.Between(35, 85);
            platform.moveFreq = Phaser.Math.FloatBetween(0.0015, 0.0024);
            platform.movePhase = Phaser.Math.FloatBetween(0, Math.PI * 2);
            this.movingPlatforms.add(platform);
        } else {
            this.platforms.add(platform);
        }
        platform.counted = false;

        // Spawn coin above platform - fully visible
        if (Phaser.Math.Between(1, 100) > 45) {
            const coin = createSkyCoin(this, this.nextPlatformX, y - 90);
            this.coins.add(coin);
        }

        // Increased spacing for better jumping freedom
        this.nextPlatformX += Phaser.Math.Between(300, 380);
    }

    revealTrophy() {
        this.trophyReady = true;
        // Create a guaranteed final platform so the trophy is reachable on the last section.
        if (!this.finalPlatform) {
            this.finalPlatform = this.add.rectangle(this.trophyX, 620, 260, 24, 0xf5b041).setStrokeStyle(4, 0xffffff).setDepth(8);
            this.physics.add.existing(this.finalPlatform, true);
            this.platforms.add(this.finalPlatform);
        }

        this.trophy.setPosition(this.trophyX, 535).setVisible(true).setScale(0.35).setAlpha(0.5);

        const hint = this.add.text(this.trophyX, 260, "TOUCH THE TROPHY TO WIN", {
            fontSize: "30px",
            color: "#ffe36f",
            fontStyle: "bold",
            stroke: "#1f2d58",
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(25);

        this.tweens.add({
            targets: this.trophy,
            scale: 1,
            alpha: 1,
            duration: 500,
            ease: "Back.easeOut"
        });

        this.tweens.add({
            targets: hint,
            alpha: 0,
            y: hint.y - 20,
            duration: 2200,
            onComplete: () => hint.destroy()
        });

        const platformHint = this.add.text(this.trophyX, 595, "FINAL PLATFORM", {
            fontSize: "24px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#1f2d58",
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(25);

        this.tweens.add({
            targets: platformHint,
            alpha: 0,
            y: platformHint.y - 18,
            duration: 2500,
            onComplete: () => platformHint.destroy()
        });
    }

    collectTrophyAndWin() {
        if (this.ended || this.finishing) return;
        this.finishing = true;
        this.trophyReady = false;
        this.player.body.setVelocity(0, 0);
        this.player.body.setEnable(false);

        // Celebration particles
        for (let i = 0; i < 20; i++) {
            const particle = this.add.text(
                this.trophy.x + Phaser.Math.Between(-100, 100),
                this.trophy.y + Phaser.Math.Between(-130, 30),
                Phaser.Utils.Array.GetRandom(["⭐", "✨", "🌟", "🎉"]),
                { fontSize: "32px" }
            ).setDepth(150);
            
            this.tweens.add({
                targets: particle,
                y: particle.y - 100,
                alpha: 0,
                rotation: Phaser.Math.FloatBetween(-2, 2),
                duration: Phaser.Math.Between(800, 1200),
                delay: i * 50,
                onComplete: () => particle.destroy()
            });
        }

        this.tweens.add({
            targets: this.trophy,
            scale: 1.5,
            angle: 360,
            duration: 600,
            ease: 'Back.easeOut',
            onComplete: () => {
                this.cameras.main.flash(500, 255, 215, 0);
                this.tweens.add({
                    targets: this.trophy,
                    y: this.trophy.y - 20,
                    duration: 400,
                    yoyo: true,
                    repeat: 2,
                    onComplete: () => this.win()
                });
            }
        });
    }

    updateHealthBar() {
        const clamped = Phaser.Math.Clamp(this.health, 0, 100);
        const ratio = clamped / 100;
        this.healthBarFill.width = 166 * ratio;
        this.healthBarFill.setFillStyle(ratio > 0.55 ? 0x59d66a : ratio > 0.3 ? 0xf0bc4a : 0xea5b5b);
    }

    canStandOnPlatform(player, platform) {
        // Allow collision only when landing from above to prevent mid-air sticking.
        const playerBottom = player.body.y + player.body.height;
        const platformTop = platform.body.y;
        const comingDown = player.body.velocity.y >= -10;
        return comingDown && playerBottom <= platformTop + 18;
    }

    spawnObstacle() {
        if (this.ended) return;

        const obstacles = ["☁️"];
        const emoji = Phaser.Utils.Array.GetRandom(obstacles);
        const y = Phaser.Math.Between(300, 550);
        
        const spawnX = this.cameras.main.scrollX + W + 120;
        const obs = this.add.text(spawnX, y, emoji, { fontSize: "48px" }).setOrigin(0.5);
        this.physics.add.existing(obs);
        obs.body.setAllowGravity(false);
        obs.speed = Phaser.Math.Between(3, 5);
        obs.spinSpeed = Phaser.Math.Between(2, 4);
        obs.wasJumpedOver = false;
        obs.hasHit = false;
        
        this.obstacles.add(obs);
    }

    spawnEagle() {
        if (this.ended) return;
        // Only spawn eagle if none exist currently
        if (this.eagles.getChildren().length > 0) return;
        
        const spawnX = this.cameras.main.scrollX + W + 140;
        const y = Phaser.Math.Between(240, 420);
        const eagle = this.add.text(spawnX, y, "🦅", { fontSize: "72px" }).setOrigin(0.5);
        this.physics.add.existing(eagle);
        eagle.body.setAllowGravity(false);
        eagle.speed = Phaser.Math.Between(3, 5); // Reduced from 6-9 to 3-5
        eagle.baseY = y;
        // No sine wave - eagle flies straight
        eagle.hasHit = false;
        this.eagles.add(eagle);
    }

    successfulJump(obstacle) {
        // Visual feedback
        const jumpText = this.add.text(obstacle.x, obstacle.y - 60, "NICE JUMP!", {
            fontSize: "26px",
            color: "#00ff00",
            fontStyle: "bold",
            stroke: "#ffffff",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(150);
        
        this.tweens.add({
            targets: jumpText,
            y: jumpText.y - 50,
            alpha: 0,
            duration: 800,
            onComplete: () => jumpText.destroy()
        });
        
        // Flash green briefly
        this.cameras.main.flash(200, 100, 255, 100, false, 0.3);
        
        // Add sparkle effect
        const sparkle = this.add.text(this.player.x, this.player.y - 40, "⭐", {
            fontSize: "32px"
        }).setOrigin(0.5).setDepth(150);
        
        this.tweens.add({
            targets: sparkle,
            scale: 2,
            alpha: 0,
            duration: 600,
            onComplete: () => sparkle.destroy()
        });
    }

    hitObstacle(obstacle) {
        this.invincible = true;
        playSfx("hit", { volume: 0.4, rate: 0.95 });

        const isEagle = obstacle.text === "🦅";
        obstacle.destroy();

        if (isEagle) {
            // Eagle hit reduces health by 25 (not full loss)
            this.cameras.main.shake(280, 0.012);
            this.cameras.main.flash(350, 255, 120, 100);

            // Flash red but keep player normal (no rotation)
            this.tweens.add({
                targets: this.player,
                scaleX: 0.85,
                scaleY: 0.85,
                duration: 200,
                yoyo: true,
                ease: "Cubic.easeOut"
            });

            // Draw a hit marker
            const hitMark = this.add.graphics().setDepth(210);
            hitMark.lineStyle(6, 0xffffff, 0.9);
            hitMark.lineBetween(this.player.x - 20, this.player.y - 20, this.player.x + 20, this.player.y + 20);
            hitMark.lineBetween(this.player.x + 20, this.player.y - 20, this.player.x - 20, this.player.y + 20);
            this.tweens.add({
                targets: hitMark,
                alpha: 0,
                duration: 400,
                onComplete: () => hitMark.destroy()
            });

            const warning = this.add.text(W / 2, H / 2, "EAGLE HIT! -25 HP", {
                fontSize: "44px",
                color: "#ff6b35",
                fontStyle: "bold",
                stroke: "#000000",
                strokeThickness: 5
            }).setOrigin(0.5).setDepth(220);
            this.tweens.add({
                targets: warning,
                alpha: 0,
                y: warning.y - 40,
                duration: 800,
                onComplete: () => warning.destroy()
            });

            this.health = Math.max(0, this.health - 25);
            this.updateHealthBar();
            
            if (this.health <= 0) {
                this.time.delayedCall(500, () => this.gameOver("YOU LOST", "Your health reached zero."));
            } else {
                this.time.delayedCall(500, () => {
                    this.invincible = false;
                });
            }
            return;
        }

        // Regular obstacle hit.
        this.cameras.main.flash(300, 255, 100, 100);
        this.health = Math.max(0, this.health - 20);
        this.updateHealthBar();

        const warning = this.add.text(W / 2, H / 2, "HIT! -20 HP", {
            fontSize: "42px",
            color: "#ff3838",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 5
        }).setOrigin(0.5).setDepth(200);

        this.tweens.add({
            targets: warning,
            alpha: 0,
            y: warning.y - 80,
            duration: 1200,
            onComplete: () => warning.destroy()
        });

        if (this.health <= 0) {
            this.gameOver("YOU LOST", "Your health reached zero.");
            return;
        }

        this.time.delayedCall(1000, () => {
            this.invincible = false;
        });
    }

    win() {
        if (this.ended) return;
        this.ended = true;
        playSfx("win", { volume: 0.55, rate: 1.0 });
        this.timerEvent.remove(false);
        this.player.body.setEnable(false);

        const completionBonus = 100;
        const totalMoney = this.runMoney + completionBonus;

        STATE.coins += totalMoney;
        STATE.stars += Math.floor(this.score / 10);
        STATE.mood = Math.min(100, STATE.mood + 15);
        STATE.energy = Math.max(20, STATE.energy - 10);
        STATE.best.starCatch = Math.max(STATE.best.starCatch, this.score);
        
        // Celebration effects
        this.cameras.main.flash(800, 255, 215, 0, false);
        
        // Confetti burst
        for (let i = 0; i < 40; i++) {
            const confetti = this.add.text(
                this.player.x + Phaser.Math.Between(-60, 60),
                this.player.y - Phaser.Math.Between(0, 40),
                Phaser.Utils.Array.GetRandom(["🎉", "🎊", "⭐", "✨", "🏆"]),
                { fontSize: "32px" }
            ).setDepth(250);
            
            this.tweens.add({
                targets: confetti,
                x: confetti.x + Phaser.Math.Between(-150, 150),
                y: confetti.y + Phaser.Math.Between(100, 300),
                angle: Phaser.Math.Between(-360, 360),
                alpha: 0,
                duration: Phaser.Math.Between(1200, 1800),
                ease: 'Cubic.easeOut',
                onComplete: () => confetti.destroy()
            });
        }
        
        // Victory jump animation
        this.tweens.add({
            targets: this.player,
            y: this.player.y - 50,
            duration: 300,
            yoyo: true,
            repeat: 2,
            ease: 'Quad.easeOut'
        });

        this.resultPanel(
            "🏆 SKY CHAMPION! 🏆", 
            `Score (platforms): ${this.score}/${this.targetPlatforms}\nMoney: $${this.runMoney} + Bonus: $${completionBonus} = $${totalMoney}`,
            () => this.scene.start("HubScene"),
            true
        );
    }

    gameOver(customTitle = "YOU LOST", customReason = "Try again and avoid eagle hits.") {
        if (this.ended) return;
        this.ended = true;
        playSfx("lose", { volume: 0.5, rate: 1.0 });
        this.timerEvent.remove(false);
        this.player.body.setEnable(false);
        
        // Apply upside down rotation on death and remove player
        this.tweens.add({
            targets: this.player,
            angle: 180,
            scaleX: 0.6,
            scaleY: 0.6,
            alpha: 0,
            y: this.player.y + 50,
            duration: 800,
            ease: "Cubic.easeIn",
            onComplete: () => {
                this.player.setVisible(false);
                this.player.destroy();
            }
        });

        STATE.best.starCatch = Math.max(STATE.best.starCatch, this.score);
        STATE.coins += this.runMoney;

        this.time.delayedCall(900, () => {
            this.resultPanel(
                customTitle,
                `${customReason}\nScore (platforms): ${this.score}/${this.targetPlatforms}\nHealth: ${this.health}% | Money kept: $${this.runMoney}`,
                () => this.scene.restart(),
                false
            );
        });
    }

    resultPanel(title, subtitle, onDone, isWin = false) {
        // Animated overlay
        const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(99).setScrollFactor(0);
        this.tweens.add({
            targets: overlay,
            alpha: 0.7,
            duration: 400,
            ease: 'Power2'
        });
        
        // Beautiful gradient panel
        const panelBg = this.add.graphics().setDepth(100).setScrollFactor(0);
        const gradient = isWin 
            ? panelBg.fillGradientStyle(0xffe6a0, 0xffe6a0, 0xffd700, 0xffd700, 1)
            : panelBg.fillGradientStyle(0xffb3ba, 0xffb3ba, 0xff6b7a, 0xff6b7a, 1);
        panelBg.fillRoundedRect(W / 2 - 360, H / 2 - 220, 720, 440, 20);
        
        const panel = this.add.rectangle(W / 2, H / 2, 680, 400 , 0xffffff, 0.95)
            .setStrokeStyle(10, isWin ? 0xffd700 : 0xff4757)
            .setDepth(101)
            .setScrollFactor(0)
            .setScale(0.3);
        
        // Panel entrance animation
        this.tweens.add({
            targets: panel,
            scaleX: 1,
            scaleY: 1,
            duration: 500,
            ease: 'Back.easeOut'
        });
        
        // Decorative particles
        if (isWin) {
            for (let i = 0; i < 30; i++) {
                const particle = this.add.text(
                    W / 2 + Phaser.Math.Between(-300, 300),
                    H / 2 + Phaser.Math.Between(-200, 200),
                    Phaser.Utils.Array.GetRandom(["⭐", "✨", "🌟", "💎", "👑"]),
                    { fontSize: Phaser.Math.Between(20, 40) + "px" }
                ).setDepth(102).setScrollFactor(0).setAlpha(0);
                
                this.tweens.add({
                    targets: particle,
                    alpha: 1,
                    y: particle.y + Phaser.Math.Between(-60, 60),
                    rotation: Phaser.Math.FloatBetween(-1, 1),
                    duration: Phaser.Math.Between(1000, 2000),
                    delay: i * 30,
                    yoyo: true,
                    repeat: -1
                });
            }
            
            const trophy = this.add.text(W / 2, 260, "🏆", { fontSize: "130px" })
                .setOrigin(0.5).setDepth(103).setScrollFactor(0).setScale(0);
            this.tweens.add({
                targets: trophy,
                scale: 1.3,
                duration: 600,
                ease: 'Elastic.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: trophy,
                        scale: 1.4,
                        duration: 800,
                        yoyo: true,
                        repeat: -1,
                        ease: 'Sine.easeInOut'
                    });
                }
            });
        } else {
            const failIcon = this.add.text(W / 2, 260, "💥", { fontSize: "130px" })
                .setOrigin(0.5).setDepth(103).setScrollFactor(0).setScale(0);
            this.tweens.add({
                targets: failIcon,
                scale: 1.2,
                angle: 360,
                duration: 500,
                ease: 'Back.easeOut'
            });
        }
        
        const titleText = this.add.text(W / 2, 360, title, {
            fontSize: "52px",
            color: isWin ? "#2d5016" : "#b71c1c",
            fontStyle: "bold",
            align: "center",
            stroke: isWin ? "#ffd700" : "#ffffff",
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(103).setScrollFactor(0).setAlpha(0);
        
        this.tweens.add({
            targets: titleText,
            alpha: 1,
            y: 350,
            duration: 600,
            delay: 300,
            ease: 'Power2'
        });
        
        const subtitleText = this.add.text(W / 2, 440, subtitle, {
            fontSize: "26px",
            color: "#1a1a1a",
            align: "center",
            fontStyle: "bold",
            wordWrap: { width: 620 }
        }).setOrigin(0.5).setDepth(103).setScrollFactor(0).setAlpha(0);
        
        this.tweens.add({
            targets: subtitleText,
            alpha: 1,
            duration: 600,
            delay: 500,
            ease: 'Power2'
        });
        
        const buttonText = isWin ? "CONTINUE" : "TRY AGAIN";
        const btn = uiButton(this, W / 2, 540, 280, 90, buttonText, onDone, isWin ? 0x4caf50 : 0xff7676, isWin ? 0x388e3c : 0xff5252);
        btn.btn.setDepth(103).setScrollFactor(0).setScale(0);
        btn.label.setDepth(104).setScrollFactor(0);
        
        this.tweens.add({
            targets: [btn.btn, btn.label],
            scaleX: 1,
            scaleY: 1,
            duration: 400,
            delay: 700,
            ease: 'Back.easeOut'
        });
    }
}

class RiverRunScene extends Phaser.Scene {
    constructor() {
        super("RiverRunScene");
    }

    create() {
        setSceneMusic("challenge");
        this.worldWidth = 7600;
        this.trackY = 612;
        this.trackTop = this.trackY - 26;
        this.dead = false;
        this.finishTriggered = false;
        this.lastBarrierX = 0;
        this.speedPenalty = 0; // Speed reduction multiplier (0 = normal, higher = slower)

        const skyGradient = this.add.graphics();
        skyGradient.fillGradientStyle(0x87ceeb, 0x87ceeb, 0xb8e6ff, 0xb8e6ff, 1);
        skyGradient.fillRect(0, 0, this.worldWidth, H * 0.6);

        this.createClouds();

        const riverGradient = this.add.graphics();
        riverGradient.fillGradientStyle(0x1e88e5, 0x1e88e5, 0x0d47a1, 0x0d47a1, 1);
        riverGradient.fillRect(0, 430, this.worldWidth, 205);

        this.add.rectangle(this.worldWidth / 2, 660, this.worldWidth, 220, 0x69d273);

        // Ground race path
        this.add.rectangle(this.worldWidth / 2, this.trackY + 28, this.worldWidth, 78, 0x7c603b).setDepth(2);
        this.add.rectangle(this.worldWidth / 2, this.trackY + 22, this.worldWidth, 10, 0xa58155).setDepth(2);
        for (let i = 0; i < 90; i++) {
            this.add.rectangle(80 + i * 86, this.trackY + 28, 42, 5, 0xdac79f, 0.85).setDepth(3);
        }

        this.createCrowd();

        this.add.text(W / 2, 50, "RIVER RACE", {
            fontSize: "56px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#1b4f73",
            strokeThickness: 7,
        }).setOrigin(0.5).setScrollFactor(0);

        this.add.text(W / 2, 98, "A/LEFT D/RIGHT SPACE/UP: Jump square obstacles and race to the finish!", {
            fontSize: "22px",
            color: "#fff1a0",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 2,
        }).setOrigin(0.5).setScrollFactor(0);

        this.distance = 0;
        this.finishDistance = 1800;
        this.speedLevel = 1;
        this.playerBaseX = 220;

        this.distanceText = this.add.text(34, 130, "Distance: 0m", {
            fontSize: "30px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 3
        }).setScrollFactor(0);

        this.levelText = this.add.text(34, 166, "Speed: 1", {
            fontSize: "28px",
            color: "#ffe58a",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 3
        }).setScrollFactor(0);

        

        this.remainingText = this.add.text(34, 238, `Finish: ${this.finishDistance}m`, {
            fontSize: "24px",
            color: "#ffd76b",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 3,
        }).setScrollFactor(0);

        this.finishLineX = this.worldWidth - 280;
        this.pxToMeters = (this.finishLineX - this.playerBaseX) / this.finishDistance;
        this.createEnhancedFinish(this.finishLineX, this.trackY + 16);

        this.playerCroc = drawCroc(this, this.playerBaseX, this.trackTop - 35, 1.05);
        this.physics.add.existing(this.playerCroc);
        this.playerCroc.body.setGravityY(1250);
        this.playerCroc.body.setCollideWorldBounds(true);
        this.playerCroc.body.setSize(210, 86, true);
        this.playerCroc.setDepth(30);

        this.physics.world.setBounds(0, 0, this.worldWidth, H + 220);
        this.cameras.main.setBounds(0, 0, this.worldWidth, H);
        this.cameras.main.setBackgroundColor(0x87ceeb);
        this.cameras.main.startFollow(this.playerCroc, true, 0.08, 0.08, -W * 0.22, 90);

        this.competitors = [
            { croc: drawCroc(this, 140, this.trackTop - 35, 0.92), isJumping: false, jumpTween: null, baseY: this.trackTop - 35, speedPenalty: 0, penaltyUntil: 0, lastHitAt: 0 },
            { croc: drawCroc(this, 70, this.trackTop - 60, 0.92), isJumping: false, jumpTween: null, baseY: this.trackTop - 60, speedPenalty: 0, penaltyUntil: 0, lastHitAt: 0 },
        ];
        this.competitors.forEach((entry) => {
            entry.croc.setDepth(28).setAlpha(0.95);
        });

        this.ground = this.add.rectangle(this.worldWidth / 2, this.trackY + 42, this.worldWidth, 20, 0x3b2b18);
        this.physics.add.existing(this.ground, true);
        this.physics.add.collider(this.playerCroc, this.ground);

        this.obstacles = this.physics.add.group();
        this.physics.add.overlap(this.playerCroc, this.obstacles, (player, obs) => {
            if (!obs.playerHit) {
                obs.playerHit = true;
                this.hitObstacle(obs);
            }
        }, null, this);
        
        // AI obstacle handling is done in race tick to avoid costly overlap spam.

        this.keys = this.input.keyboard.addKeys({
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            up: Phaser.Input.Keyboard.KeyCodes.SPACE,
            arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
            arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
            arrowUp: Phaser.Input.Keyboard.KeyCodes.UP,
        });
        this.phoneControls = createPhoneControls(this, { up: true });

        this.obstacleEvent = this.time.addEvent({ delay: 1850, loop: true, callback: () => this.spawnBarrier() });

        this.raceTick = this.time.addEvent({
            delay: 100,
            loop: true,
            callback: () => {
                if (this.dead) return;

                this.distance = Math.max(0, Math.floor((this.playerCroc.x - this.playerBaseX) / this.pxToMeters));
                this.distanceText.setText(`Distance: ${Math.floor(this.distance)}m`);
                this.remainingText.setText(`Finish: ${Math.max(0, Math.floor(this.finishDistance - this.distance))}m`);

                const newLevel = 1 + Math.floor(this.distance / 140);
                if (newLevel !== this.speedLevel) {
                    this.speedLevel = newLevel;
                    this.levelText.setText(`Speed: ${this.speedLevel}`);
                }

                const playerNoseX = this.playerCroc.x + 225;
                if (playerNoseX >= this.finishLineX && !this.finishTriggered) {
                    this.triggerFinish("player");
                }

                this.competitors.forEach((entry, idx) => {
                    if (entry.penaltyUntil > 0 && this.time.now > entry.penaltyUntil) {
                        entry.speedPenalty = Math.max(0, entry.speedPenalty - 0.04);
                        if (entry.speedPenalty <= 0.01) {
                            entry.speedPenalty = 0;
                            entry.penaltyUntil = 0;
                        }
                    }

                    // Improved AI competitor speed - slower and more balanced
                    // Base speed reduced to ensure player has fair chance
                    const baseSpeed = 1.8 + idx * 0.12;
                    const randomVariation = Math.random() * 0.08;
                    const compStep = baseSpeed + randomVariation;
                    const effective = compStep * (1 - entry.speedPenalty);
                    
                    // Calculate distance from player
                    const distanceFromPlayer = entry.croc.x - this.playerCroc.x;
                    
                    // Prevent AI from getting too far ahead (rubber-banding)
                    let movementSpeed = Math.max(6.5, effective * 8.2);
                    if (distanceFromPlayer > 180) {
                        // Slow down significantly if too far ahead
                        movementSpeed *= 0.4;
                    } else if (distanceFromPlayer > 100) {
                        // Moderate slowdown
                        movementSpeed *= 0.7;
                    }
                    
                    entry.croc.x += movementSpeed;
                    this.checkCompetitorJump(entry, idx);

                    // Only show message when competitor gets ahead, don't trigger finish
                    const compNoseX = entry.croc.x + 215;
                    if (compNoseX >= this.finishLineX && !entry.crossedFinish) {
                        entry.crossedFinish = true;
                        // Stop the competitor at finish line to wait
                        this.tweens.add({
                            targets: entry.croc,
                            alpha: 0.6,
                            duration: 300
                        });
                        if (this.distance < this.finishDistance - 100) {
                            this.statusText.setText(`Competitor ${idx + 1} is ahead! Speed up!`);
                        }
                    }
                    
                    // Freeze competitor movement after crossing finish
                    if (entry.crossedFinish) {
                        entry.croc.x = this.finishLineX - 215; // Keep at finish line
                    }
                });
            }
        });

        const homeBtn = uiButton(this, W - 100, 44, 170, 52, "HOME", () => this.scene.start("HubScene"), 0xff7d7d, 0xff5858);
        homeBtn.btn.setScrollFactor(0);
        homeBtn.label.setScrollFactor(0);

        registerSceneCleanup(this, () => this.stopRaceMotion());
    }

    createClouds() {
        const width = this.worldWidth || W;
        this.clouds = [];
        for (let i = 0; i < 6; i++) {
            const cloud = this.add.graphics();
            cloud.fillStyle(0xffffff, 0.7);
            const x = Phaser.Math.Between(80, width - 80);
            const y = Phaser.Math.Between(80, 290);
            cloud.fillCircle(x, y, 40);
            cloud.fillCircle(x + 30, y - 10, 35);
            cloud.fillCircle(x + 55, y, 38);
            cloud.setDepth(1);

            const tween = this.tweens.add({
                targets: cloud,
                x: x + 36,
                duration: Phaser.Math.Between(9000, 13000),
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut"
            });

            this.clouds.push({ cloud, tween });
        }
    }

    createCrowd() {
        this.crowdTweens = [];

        const shirts = [0xff8a80, 0x80d8ff, 0xfff59d, 0xb9f6ca, 0xd1c4e9];
        const skins = [0xf4c7a1, 0xe0ac69, 0xd89a6a];

        // Split crowd: left side and right side on green field
        for (let i = 0; i < 35; i++) {
            const x = 60 + i * 108;
            const y = this.trackY + 90 + (i % 2) * 8;

            const person = this.add.container(x, y).setDepth(13);
            const body = this.add.rectangle(0, 10, 16, 24, shirts[i % shirts.length]);
            const head = this.add.circle(0, -8, 8, skins[i % skins.length]);
            const armL = this.add.rectangle(-10, 7, 4, 16, skins[(i + 1) % skins.length]);
            const armR = this.add.rectangle(10, 7, 4, 16, skins[(i + 2) % skins.length]);
            const legL = this.add.rectangle(-4, 25, 4, 12, 0x2f2f2f);
            const legR = this.add.rectangle(4, 25, 4, 12, 0x2f2f2f);
            person.add([body, head, armL, armR, legL, legR]);

            const cheerTween = this.tweens.add({
                targets: [person, armL, armR],
                y: { from: person.y, to: person.y - Phaser.Math.Between(4, 8) },
                angle: { from: -6, to: 6 },
                duration: Phaser.Math.Between(420, 680),
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut"
            });
            this.crowdTweens.push(cheerTween);
        }
        
        // Right side spectators
        for (let i = 0; i < 35; i++) {
            const x = 60 + i * 108;
            const y = this.trackY - 55 + (i % 2) * 8;

            const person = this.add.container(x, y).setDepth(13);
            const body = this.add.rectangle(0, 10, 16, 24, shirts[i % shirts.length]);
            const head = this.add.circle(0, -8, 8, skins[i % skins.length]);
            const armL = this.add.rectangle(-10, 7, 4, 16, skins[(i + 1) % skins.length]);
            const armR = this.add.rectangle(10, 7, 4, 16, skins[(i + 2) % skins.length]);
            const legL = this.add.rectangle(-4, 25, 4, 12, 0x2f2f2f);
            const legR = this.add.rectangle(4, 25, 4, 12, 0x2f2f2f);
            person.add([body, head, armL, armR, legL, legR]);

            const cheerTween = this.tweens.add({
                targets: [person, armL, armR],
                y: { from: person.y, to: person.y - Phaser.Math.Between(4, 8) },
                angle: { from: -6, to: 6 },
                duration: Phaser.Math.Between(420, 680),
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut"
            });
            this.crowdTweens.push(cheerTween);
        }
    }

    createEnhancedFinish(x, y) {
        // 3D finish line with two posts and wider rope
        // Back posts (darker, for depth effect)
        this.add.rectangle(x - 110, y - 42, 12, 140, 0x3d2817).setDepth(9);
        this.add.rectangle(x + 110, y - 42, 12, 140, 0x3d2817).setDepth(9);
        // Front posts (brighter, closer)
        this.add.rectangle(x - 110, y - 40, 14, 135, 0x5a3f2a).setDepth(10);
        this.add.rectangle(x + 110, y - 40, 14, 135, 0x5a3f2a).setDepth(10);
        // Shadow/3D effect on posts
        this.add.rectangle(x - 110 + 8, y - 35, 4, 125, 0x2d1810).setDepth(10);
        this.add.rectangle(x + 110 + 8, y - 35, 4, 125, 0x2d1810).setDepth(10);
        
        // Multiple rope layers for 3D appearance
        // Back rope (shadow)
        this.add.rectangle(x, y - 36, 240, 12, 0xc9a876).setDepth(9);
        // Main rope
        this.finishRope = this.add.rectangle(x, y - 34, 250, 15, 0xfff2d1).setDepth(11).setStrokeStyle(3, 0x9e7b52);
        // Rope highlight for 3D effect
        this.add.rectangle(x, y - 36, 250, 6, 0xffffff, 0.4).setDepth(12);
        
        this.add.text(x, y - 78, "FINISH", {
            fontSize: "32px",
            color: "#ffeb3b",
            fontStyle: "bold",
            stroke: "#1a1a1a",
            strokeThickness: 5
        }).setOrigin(0.5).setDepth(13);
    }

    update() {
        if (this.dead) return;

        if (Phaser.Input.Keyboard.JustDown(this.keys.up) || Phaser.Input.Keyboard.JustDown(this.keys.arrowUp) || this.phoneControls.consume("up")) {
            this.jump();
        }

        this.playerCroc.angle = 0;
        this.playerCroc.setAlpha(1);

        // Apply speed penalty if player hit obstacle
        const baseForward = 310;
        const forward = baseForward * (1 - this.speedPenalty);
        const steer = 82;
        let vx = forward;
        if (this.keys.left.isDown || this.keys.arrowLeft.isDown || this.phoneControls.isDown("left")) vx -= steer;
        if (this.keys.right.isDown || this.keys.arrowRight.isDown || this.phoneControls.isDown("right")) vx += steer;
        this.playerCroc.body.setVelocityX(vx);

        this.obstacles.getChildren().forEach((obs) => {
            if (!obs.active) return;
            if (obs.x < this.cameras.main.scrollX - 140) {
                obs.destroy();
            }
        });
    }

    jump() {
        if (this.dead) return;
        if (this.playerCroc.body.blocked.down || this.playerCroc.body.touching.down) {
            // High jump for wide horizontal distance during jump
            this.playerCroc.body.setVelocityY(-820);
            playSfx("jump", { volume: 0.33, rate: 1.04 });
        }
    }

    spawnBarrier() {
        if (this.dead) return;

        const size = Phaser.Math.Between(62, 86);
        let spawnX = this.cameras.main.scrollX + W + 220;
        const minGap = 320;
        if (spawnX - this.lastBarrierX < minGap) {
            spawnX = this.lastBarrierX + minGap;
        }
        this.lastBarrierX = spawnX;

        const y = (this.trackY + 32) - size / 2;

        const block = this.add.rectangle(spawnX, y, size, size, 0x8a5b30)
            .setStrokeStyle(3, 0x6d4825)
            .setDepth(26);
        this.physics.add.existing(block);
        block.body.setAllowGravity(false);
        block.body.setImmovable(true);
        block.body.setVelocityX(-(332 + this.speedLevel * 24));

        this.obstacles.add(block);
    }

    aiJumpObstacle(entry, obs, idx) {
        if (!obs || !obs.active || entry.isJumping || entry.jumpTween) return;
        if (obs[`aiJump${idx}`]) return;
        obs[`aiJump${idx}`] = true;

        entry.isJumping = true;
        const apex = entry.baseY - 128;
        entry.jumpTween = this.tweens.timeline({
            targets: entry.croc,
            tweens: [
                { y: apex, angle: -8, duration: 250, ease: "Quad.easeOut" },
                { y: entry.baseY, angle: 0, duration: 290, ease: "Quad.easeIn" }
            ],
            onComplete: () => {
                entry.isJumping = false;
                entry.jumpTween = null;
            }
        });
    }

    competitorHitObstacle(entry, obs, idx) {
        // AI SHOULD NEVER HIT OBSTACLES - they always jump proactively
        // This function is disabled to prevent any game-stopping issues
        // AI obstacles are handled ONLY through checkCompetitorJump
    }

    checkCompetitorJump(entry, idx) {
        if (entry.isJumping || entry.jumpTween) return;
        const obstacles = this.obstacles.getChildren();
        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            if (!obs.active) continue;
            const dx = obs.x - entry.croc.x;
            // AI proactively jumps BEFORE obstacles get close - much earlier detection
            // This ensures they NEVER physically collide with obstacles
            if (dx > 65 && dx < 240 && !obs[`aiJump${idx}`]) {
                this.aiJumpObstacle(entry, obs, idx);
                return;
            }
        }
    }

    hitObstacle(obstacle) {
        if (this.dead) return;
        playSfx("hit", { volume: 0.4, rate: 0.92 });
        
        // Apply persistent speed reduction for 2 seconds
        this.speedPenalty = 0.25; // 25% slower
        
        this.time.delayedCall(2000, () => {
            // Gradually restore speed
            this.tweens.add({
                targets: this,
                speedPenalty: 0,
                duration: 800,
                ease: 'Quad.easeOut'
            });
        });
        
        // Flash player briefly
        this.tweens.add({
            targets: this.playerCroc,
            alpha: 0.5,
            duration: 200,
            yoyo: true,
            repeat: 2
        });
        
        // Show warning text
        const warning = this.add.text(this.playerCroc.x, this.playerCroc.y - 60, "COLLISION! SPEED DOWN", {
            fontSize: "24px",
            color: "#ff9800",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(100);
        
        this.tweens.add({
            targets: warning,
            alpha: 0,
            y: warning.y - 40,
            duration: 600,
            onComplete: () => warning.destroy()
        });
        
        obstacle.destroy();
    }

    triggerFinish(type, competitorIndex) {
        if (this.finishTriggered || this.dead) return;
        this.finishTriggered = true;

        // Rope snaps when touched.
        if (this.finishRope) {
            this.tweens.add({
                targets: this.finishRope,
                angle: 30,
                alpha: 0,
                y: this.finishRope.y + 18,
                duration: 260,
                ease: "Quad.easeOut",
                onComplete: () => this.finishRope.destroy()
            });
        }

        if (type === "player") {
            this.time.delayedCall(420, () => this.win());
        } else {
            this.time.delayedCall(420, () => this.competitorWins(competitorIndex));
        }
    }

    stopRaceMotion() {
        if (this.obstacleEvent) this.obstacleEvent.remove(false);
        if (this.raceTick) this.raceTick.remove(false);
        if (this.clouds) {
            this.clouds.forEach((item) => {
                if (item.tween) item.tween.stop();
            });
        }
        if (this.crowdTweens) {
            this.crowdTweens.forEach((tween) => tween.stop());
        }
    }

    fail() {
        if (this.dead) return;
        this.dead = true;
        playSfx("lose", { volume: 0.5, rate: 0.96 });
        this.stopRaceMotion();
        this.playerCroc.body.setEnable(false);

        this.cameras.main.shake(300, 0.01);
        this.cameras.main.flash(400, 255, 0, 0);

        STATE.best.riverRun = Math.max(STATE.best.riverRun, this.distance);
        this.endPanel("CRASHED", `Distance: ${Math.floor(this.distance)}m\nJump each square obstacle to survive.`, () => this.scene.restart(), false, false);
    }

    win() {
        if (this.dead) return;
        this.dead = true;
        playSfx("win", { volume: 0.56, rate: 1.0 });
        this.stopRaceMotion();
        this.playerCroc.body.setEnable(false);

        this.cameras.main.flash(600, 255, 215, 0);
        sparkles(this, 15);

        const bonus = Math.floor(this.distance / 2);
        STATE.coins += 140 + bonus;
        STATE.energy = Math.max(30, STATE.energy - 15);
        STATE.mood = Math.min(100, STATE.mood + 10);
        STATE.best.riverRun = Math.max(STATE.best.riverRun, this.distance);

        this.endPanel(
            "YOU WIN!",
            `Distance: ${Math.floor(this.distance)}m\nCoins +${140 + bonus}\nThe crowd celebrates your win!`,
            () => this.scene.start("HubScene"),
            true,
            false
        );
    }

    competitorWins(competitorIndex) {
        if (this.dead) return;
        this.dead = true;
        playSfx("lose", { volume: 0.5, rate: 1.02 });
        this.stopRaceMotion();
        this.playerCroc.body.setEnable(false);

        this.tweens.add({
            targets: this.competitors[competitorIndex].croc,
            scaleX: 1.3,
            scaleY: 1.3,
            duration: 300,
            yoyo: true,
            repeat: 3
        });

        STATE.best.riverRun = Math.max(STATE.best.riverRun, this.distance);

        this.endPanel(
            "COMPETITOR WON",
            `You reached ${Math.floor(this.distance)}m\nCompetitor ${competitorIndex + 1} crossed first.`,
            () => this.scene.restart(),
            false,
            true
        );
    }

    endPanel(title, subtitle, onDone, showTrophy = false, isCompetitorWin = false) {
        // Animated overlay
        const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(99).setScrollFactor(0);
        this.tweens.add({
            targets: overlay,
            alpha: 0.75,
            duration: 400
        });
        
        // Beautiful gradient background - brighter for winner, dimmer for loser
        const panelBg = this.add.graphics().setDepth(100).setScrollFactor(0);
        if (showTrophy) {
            // Bright golden gradient for winner
            panelBg.fillGradientStyle(0xffd700, 0xffd700, 0xffa500, 0xffa500, 1);
        } else if (isCompetitorWin) {
            // Sad purple/blue for competitor win
            panelBg.fillGradientStyle(0xb3b3ff, 0xb3b3ff, 0x6d6dff, 0x6d6dff, 1);
        } else {
            // Red for regular loss
            panelBg.fillGradientStyle(0xffcccc, 0xffcccc, 0xff9999, 0xff9999, 1);
        }
        panelBg.fillRoundedRect(W / 2 - 360, H / 2 - 240, 720, 480, 20);
        
        const panel = this.add.rectangle(W / 2, H / 2, 680, 440, 0xffffff, 0.95)
            .setStrokeStyle(10, showTrophy ? 0xffd700 : 0xff4757)
            .setDepth(101)
            .setScrollFactor(0)
            .setScale(0.3);
        
        this.tweens.add({
            targets: panel,
            scaleX: 1,
            scaleY: 1,
            duration: 500,
            ease: 'Back.easeOut'
        });
        
        // Effects
        if (showTrophy) {
            // Victory sparkles
            for (let i = 0; i < 25; i++) {
                const sparkle = this.add.text(
                    W / 2 + Phaser.Math.Between(-320, 320),
                    H / 2 + Phaser.Math.Between(-220, 220),
                    Phaser.Utils.Array.GetRandom(["⭐", "✨", "🌟", "💫"]),
                    { fontSize: Phaser.Math.Between(24, 48) + "px" }
                ).setDepth(102).setScrollFactor(0).setAlpha(0);
                
                this.tweens.add({
                    targets: sparkle,
                    alpha: 1,
                    y: sparkle.y + Phaser.Math.Between(-70, 70),
                    rotation: Phaser.Math.FloatBetween(-2, 2),
                    duration: Phaser.Math.Between(1500, 2500),
                    delay: i * 40,
                    yoyo: true,
                    repeat: -1
                });
            }
            
            // Large animated trophy for winner
            const trophy = this.add.text(W / 2, 250, "🏆", { fontSize: "160px" })
                .setOrigin(0.5).setDepth(103).setScrollFactor(0).setScale(0);
            this.tweens.add({
                targets: trophy,
                scale: 1.5,
                duration: 800,
                ease: 'Elastic.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: trophy,
                        scale: 1.6,
                        duration: 900,
                        yoyo: true,
                        repeat: -1,
                        ease: 'Sine.easeInOut'
                    });
                }
            });
        } else if (isCompetitorWin) {
            // Competitor won - show sad icon prominently
            const sadIcon = this.add.text(W / 2, 250, "😢", { fontSize: "140px" })
                .setOrigin(0.5).setDepth(103).setScrollFactor(0).setScale(0);
            this.tweens.add({
                targets: sadIcon,
                scale: 1.3,
                duration: 600,
                ease: 'Back.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: sadIcon,
                        y: sadIcon.y + 12,
                        duration: 1200,
                        yoyo: true,
                        repeat: -1,
                        ease: 'Sine.easeInOut'
                    });
                }
            });
        } else {
            // Regular fail - crash icon
            const crashIcon = this.add.text(W / 2, 250, "💥", { fontSize: "140px" })
                .setOrigin(0.5).setDepth(103).setScrollFactor(0).setScale(0);
            this.tweens.add({
                targets: crashIcon,
                scale: 1.3,
                angle: 360,
                duration: 700,
                ease: 'Back.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: crashIcon,
                        angle: 360,
                        duration: 1500,
                        repeat: -1,
                        ease: 'Linear'
                    });
                }
            });
        }
        
        const titleText = this.add.text(W / 2, 390, title, { 
            fontSize: "52px", 
            color: showTrophy ? "#1a3a00" : (isCompetitorWin ? "#2d3d66" : "#b71c1c"),
            fontStyle: "bold",
            align: "center",
            stroke: showTrophy ? "#ff8c00" : (isCompetitorWin ? "#ffffff" : "#ffffff"),
            strokeThickness: 5
        }).setOrigin(0.5).setDepth(103).setScrollFactor(0).setAlpha(0);
        
        this.tweens.add({
            targets: titleText,
            alpha: 1,
            y: 385,
            duration: 600,
            delay: 300,
            ease: 'Power2.easeOut'
        });
        
        const subtitleText = this.add.text(W / 2, 470, subtitle, { 
            fontSize: "26px", 
            color: "#1a1a1a",
            align: "center",
            fontStyle: "bold",
            wordWrap: { width: 620 },
            stroke: "#ffffff",
            strokeThickness: 2
        }).setOrigin(0.5).setDepth(103).setScrollFactor(0).setAlpha(0);
        
        this.tweens.add({
            targets: subtitleText,
            alpha: 1,
            duration: 600,
            delay: 500,
            ease: 'Power2.easeOut'
        });
        
        // Button color based on outcome
        const btnColor = showTrophy ? 0x2ecc71 : (isCompetitorWin ? 0x9c27b0 : 0xff7676);
        const btnHoverColor = showTrophy ? 0x27ae60 : (isCompetitorWin ? 0x7b1fa2 : 0xff5252);
        const buttonText = showTrophy ? "CONTINUE" : "TRY AGAIN";
        const btn = uiButton(this, W / 2, 570, 300, 100, buttonText, onDone, btnColor, btnHoverColor);
        btn.btn.setDepth(103).setScrollFactor(0).setScale(0).setStrokeStyle(6, 0xffffff);
        btn.label.setDepth(104).setScrollFactor(0).setFontSize("32px");
        
        this.tweens.add({
            targets: [btn.btn, btn.label],
            scaleX: 1,
            scaleY: 1,
            duration: 500,
            delay: 700,
            ease: 'Back.easeOut'
        });
    }
}

class MemoryScene extends Phaser.Scene {
    constructor() {
        super("MemoryScene");
    }

    create() {
        setSceneMusic("challenge");
        sky(this, 0xae91fa);

        this.add.text(W / 2, 52, "MEMORY FUN", {
            fontSize: "50px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#351b69",
            strokeThickness: 6,
        }).setOrigin(0.5);

        this.memoryStages = [
            { name: "Animal Pairs", prompt: "Peek first, then match 4 full-body friends.", pairCount: 4, timeLimit: 40, peekMs: 1600, reward: 120 },
            { name: "Safari Shuffle", prompt: "More cards, less preview time, faster thinking.", pairCount: 5, timeLimit: 38, peekMs: 1000, reward: 170 },
            { name: "Grand Parade", prompt: "Final round: 6 pairs with no preview at all.", pairCount: 6, timeLimit: 44, peekMs: 0, reward: 220 },
        ];
        this.animalKeys = ["croc", "bear", "panda", "turtle", "duck", "fish"];
        this.stageIndex = 0;
        this.totalScore = 0;
        this.cards = [];
        this.stageTimer = null;
        this.panelObjects = [];
        this.locked = false;
        this.first = null;
        this.second = null;

        this.movesText = this.add.text(40, 28, "Moves: 0", { fontSize: "28px", color: "#ffffff", fontStyle: "bold", stroke: "#351b69", strokeThickness: 3 });
        this.stageText = this.add.text(40, 60, "Stage 1", { fontSize: "24px", color: "#fff1a8", fontStyle: "bold", stroke: "#351b69", strokeThickness: 3 });
        this.challengeText = this.add.text(W / 2, 108, "", {
            fontSize: "22px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#351b69",
            strokeThickness: 3,
            align: "center"
        }).setOrigin(0.5);
        this.timerText = this.add.text(W - 40, 28, "Time: 0", { fontSize: "28px", color: "#ffffff", fontStyle: "bold", stroke: "#351b69", strokeThickness: 3 }).setOrigin(1, 0);
        this.scoreText = this.add.text(W - 40, 96, "Total Score: 0", { fontSize: "22px", color: "#fff6c7", fontStyle: "bold", stroke: "#351b69", strokeThickness: 3 }).setOrigin(1, 0);

        uiButton(this, W - 100, 44, 170, 52, "HOME", () => this.scene.start("HubScene"), 0xff7d7d, 0xff5858);

        this.startStage(0);
    }

    clearBoard() {
        if (this.stageTimer) {
            this.stageTimer.remove(false);
            this.stageTimer = null;
        }
        this.cards.forEach((card) => {
            card.base.destroy();
            card.shine.destroy();
            card.label.destroy();
            card.q.destroy();
            card.art.destroy();
        });
        this.cards = [];
        this.panelObjects.forEach((obj) => obj.destroy());
        this.panelObjects = [];
    }

    startStage(stageIndex) {
        this.clearBoard();
        this.stageIndex = stageIndex;
        this.stage = this.memoryStages[stageIndex];
        this.moves = 0;
        this.matches = 0;
        this.first = null;
        this.second = null;
        this.locked = false;
        this.timeLeft = this.stage.timeLimit;
        this.movesText.setText("Moves: 0");
        this.stageText.setText(`Stage ${stageIndex + 1}: ${this.stage.name}`);
        this.challengeText.setText(this.stage.prompt);
        this.timerText.setText(`Time: ${this.timeLeft}`);
        this.scoreText.setText(`Total Score: ${this.totalScore}`);

        const deck = Phaser.Utils.Array.Shuffle([...this.animalKeys]).slice(0, this.stage.pairCount);
        const cards = Phaser.Utils.Array.Shuffle(deck.flatMap((animalKey) => [animalKey, animalKey]));
        const positions = this.getCardPositions(cards.length);
        this.cards = positions.map((position, index) => this.createCard(position.x, position.y, position.width, position.height, cards[index]));

        if (this.stage.peekMs > 0) {
            this.locked = true;
            this.cards.forEach((card) => this.revealCard(card, false));
            this.time.delayedCall(this.stage.peekMs, () => {
                this.cards.forEach((card) => this.hideCard(card, false));
                this.locked = false;
                this.startTimer();
            });
        } else {
            this.startTimer();
        }
    }

    startTimer() {
        this.stageTimer = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => {
                if (this.locked) return;
                this.timeLeft--;
                this.timerText.setText(`Time: ${this.timeLeft}`);
                if (this.timeLeft <= 0) {
                    this.failStage();
                }
            }
        });
    }

    getCardPositions(totalCards) {
        const cols = totalCards === 12 ? 4 : totalCards === 10 ? 5 : 4;
        const rows = Math.ceil(totalCards / cols);
        const width = cols === 5 ? 150 : 170;
        const height = rows === 3 ? 150 : 180;
        const startX = cols === 5 ? 170 : 195;
        const gapX = cols === 5 ? 188 : 230;
        const startY = rows === 3 ? 230 : 260;
        const gapY = rows === 3 ? 170 : 220;
        const positions = [];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const index = r * cols + c;
                if (index >= totalCards) break;
                positions.push({ x: startX + c * gapX, y: startY + r * gapY, width, height });
            }
        }

        return positions;
    }

    createCard(x, y, width, height, animalKey) {
        const base = this.add.rectangle(x, y, width, height, 0xffffff, 0.98)
            .setStrokeStyle(4, 0x4d7be5)
            .setInteractive({ useHandCursor: true });
        const shine = this.add.rectangle(x, y - height / 2 + 18, width - 12, 18, 0xdff0ff, 0.75);
        const q = this.add.text(x, y - 6, "?", { fontSize: `${Math.round(height * 0.42)}px`, color: "#4d7be5", fontStyle: "bold" }).setOrigin(0.5);
        const art = createAnimalDisplay(this, animalKey, x, y + 6, width / 170).setVisible(false);
        const label = this.add.text(x, y + height / 2 - 22, animalKey.toUpperCase(), {
            fontSize: width > 155 ? "16px" : "14px",
            color: "#314f8c",
            fontStyle: "bold",
        }).setOrigin(0.5).setVisible(false);
        const card = { base, shine, q, art, label, animalKey, matched: false, up: false };

        base.on("pointerdown", () => this.flip(card));
        return card;
    }

    flip(card) {
        if (this.locked || card.matched || card.up) return;
        playSfx("click", { volume: 0.2, rate: 1.15 });

        this.revealCard(card);

        if (!this.first) {
            this.first = card;
            return;
        }

        this.second = card;
        this.locked = true;
        this.moves += 1;
        this.movesText.setText(`Moves: ${this.moves}`);

        this.time.delayedCall(520, () => {
            if (this.first.animalKey === this.second.animalKey) {
                playSfx("coin", { volume: 0.3, rate: 1.1 });
                this.first.matched = true;
                this.second.matched = true;
                this.first.base.setFillStyle(0x8fe196);
                this.second.base.setFillStyle(0x8fe196);
                this.first.shine.setFillStyle(0xd7ffd7, 0.85);
                this.second.shine.setFillStyle(0xd7ffd7, 0.85);
                this.matches += 1;

                sparkles(this, 2);

                if (this.matches === this.stage.pairCount) {
                    this.completeStage();
                }
            } else {
                this.hideCard(this.first);
                this.hideCard(this.second);
            }

            this.first = null;
            this.second = null;
            this.locked = false;
        });
    }

    revealCard(card, animate = true) {
        card.up = true;
        card.base.setFillStyle(0xfff5bf);
        card.shine.setFillStyle(0xfffbe2, 0.9);
        card.q.setVisible(false);
        card.art.setVisible(true);
        card.label.setVisible(true);
        if (animate) {
            this.tweens.add({
                targets: [card.base, card.art],
                scaleX: 1.03,
                scaleY: 1.03,
                duration: 110,
                yoyo: true,
            });
        }
    }

    hideCard(card, animate = true) {
        card.up = false;
        card.base.setFillStyle(0xffffff);
        card.shine.setFillStyle(0xdff0ff, 0.75);
        card.art.setVisible(false);
        card.label.setVisible(false);
        card.q.setVisible(true);
        if (animate) {
            this.tweens.add({
                targets: card.base,
                scaleX: 0.97,
                scaleY: 0.97,
                duration: 80,
                yoyo: true,
            });
        }
    }

    completeStage() {
        this.locked = true;
        if (this.stageTimer) {
            this.stageTimer.remove(false);
            this.stageTimer = null;
        }

        const stageScore = Math.max(50, this.stage.reward + this.timeLeft * 6 - this.moves * 10);
        this.totalScore += stageScore;
        this.scoreText.setText(`Total Score: ${this.totalScore}`);

        if (this.stageIndex < this.memoryStages.length - 1) {
            this.showPanel(
                `${this.stage.name} Clear!`,
                `Stage score: ${stageScore}\nNext up: ${this.memoryStages[this.stageIndex + 1].name}`,
                "NEXT CHALLENGE",
                () => this.startStage(this.stageIndex + 1),
                0x7f7dff
            );
            return;
        }

        STATE.best.memory = Math.max(STATE.best.memory, this.totalScore);
        playSfx("win", { volume: 0.52, rate: 1.0 });
        STATE.coins += 140 + Math.floor(this.totalScore / 6);
        STATE.mood = Math.min(100, STATE.mood + 16);
        STATE.energy = Math.max(30, STATE.energy - 4);

        this.showPanel(
            "Memory Master!",
            `Total score: ${this.totalScore}\nCoins +${140 + Math.floor(this.totalScore / 6)}\nMoves this round: ${this.moves}`,
            "BACK TO HUB",
            () => this.scene.start("HubScene"),
            0x4d7be5
        );
    }

    failStage() {
        this.locked = true;
        playSfx("lose", { volume: 0.46, rate: 1.0 });
        if (this.stageTimer) {
            this.stageTimer.remove(false);
            this.stageTimer = null;
        }
        this.showPanel(
            "Time's Up!",
            `You ran out of time in ${this.stage.name}.\nTry the challenge again with fewer moves.`,
            "RETRY STAGE",
            () => this.startStage(this.stageIndex),
            0xff7d7d
        );
    }

    showPanel(title, subtitle, buttonText, onDone, color) {
        const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.48).setDepth(200);
        const panel = this.add.rectangle(W / 2, H / 2, 620, 320, 0xffffff, 0.96).setStrokeStyle(8, color).setDepth(201);
        const titleText = this.add.text(W / 2, 292, title, {
            fontSize: "46px",
            color: "#2b4a91",
            fontStyle: "bold",
            align: "center",
            stroke: "#ffffff",
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(202);
        const subtitleText = this.add.text(W / 2, 386, subtitle, {
            fontSize: "26px",
            color: "#2a2a2a",
            align: "center",
            fontStyle: "bold",
        }).setOrigin(0.5).setDepth(202);
        const btn = uiButton(this, W / 2, 490, 280, 76, buttonText, onDone, color, 0x355dc0);
        btn.btn.setDepth(202);
        btn.label.setDepth(203);
        this.panelObjects = [overlay, panel, titleText, subtitleText, btn.btn, btn.label];
    }
}

class DrawScene extends Phaser.Scene {
    constructor() {
        super("DrawScene");
    }

    create() {
        setSceneMusic("background");
        sky(this, 0x87b8ff);

        this.add.text(W / 2, 34, "🎨 DRAW YOUR CROC", {
            fontSize: "42px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#27407a",
            strokeThickness: 5,
        }).setOrigin(0.5);

        this.currentSketchIdx = 0;
        this.currentColor = 0x2f8a36;
        this.isDrawing = false;
        this.currentTool = "pen"; // "pen" or "eraser"
        this.lastDrawSoundAt = 0;
        this.colorButtons = [];
        this.sketchButtons = [];
        this.drawLayers = [];

        // Top: Sketch selection
        

        SKETCH_TEMPLATES.forEach((tpl, idx) => {
            const btnX = 260 + idx * 250;
            const isActive = idx === this.currentSketchIdx;
            const btn = this.add.rectangle(btnX, 100, 240, 44, isActive ? 0x4db8ff : 0x9db4ff)
                .setStrokeStyle(3, isActive ? 0xffff00 : 0xffffff)
                .setInteractive({ useHandCursor: true });

            const label = this.add.text(btnX, 100, tpl.name, { fontSize: "18px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5);
            this.sketchButtons.push({ btn, label, idx });

            btn.on("pointerdown", () => {
                this.currentSketchIdx = idx;
                this.refreshSketchButtons();
                this.redrawBoard();
            });

            btn.on("pointerover", () => this.tweens.add({ targets: btn, scaleX: 1.06, scaleY: 1.06, duration: 100 }));
            btn.on("pointerout", () => this.tweens.add({ targets: btn, scaleX: 1.0, scaleY: 1.0, duration: 100 }));
        });

        // Canvas area - increased size
        this.canvasX = 640;
        this.canvasY = 400;
        this.canvasWidth = 1000;
        this.canvasHeight = 480;
        this.board = this.add.rectangle(this.canvasX, this.canvasY, this.canvasWidth, this.canvasHeight, 0xf7fbff).setStrokeStyle(5, 0x4d7be5);
        this.drawLayers = SKETCH_TEMPLATES.map((_, idx) => {
            const layer = this.add.graphics().setDepth(7);
            layer.setVisible(idx === this.currentSketchIdx);
            return layer;
        });
        this.graphics = this.drawLayers[this.currentSketchIdx];
        this.board.setDepth(4);

        // Draw guide (template)
        this.templateGuide = null;
        this.redrawBoard();

        // Left panel: Colors - adjusted position
        const leftPanelX = this.canvasX - this.canvasWidth/2 - 70;
       
        const palette = [
            { color: 0x2f8a36, name: "🟢" },
            { color: 0x3fa0ff, name: "🔵" },
            { color: 0xff7b8e, name: "🔴" },
            { color: 0xffc25a, name: "🟡" },
            { color: 0xa878ff, name: "🟣" },
            { color: 0x111111, name: "⚫" },
            { color: 0xffffff, name: "⚪" }
        ];

        palette.forEach((p, i) => {
            const colBtn = this.add.rectangle(leftPanelX, 210 + i * 55, 110, 48, p.color)
                .setStrokeStyle(this.currentColor === p.color ? 6 : 3, this.currentColor === p.color ? 0xffff00 : 0xffffff)
                .setInteractive({ useHandCursor: true });

            this.add.text(leftPanelX, 210 + i * 55, p.name, { fontSize: "28px" }).setOrigin(0.5);
            this.colorButtons.push({ btn: colBtn, color: p.color });

            colBtn.on("pointerdown", () => {
                this.currentColor = p.color;
                this.currentTool = "pen";
                this.updateToolButtons();
                this.refreshColorButtons();
            });

            colBtn.on("pointerover", () => {
                this.tweens.add({ targets: colBtn, scaleX: 1.08, scaleY: 1.08, duration: 100 });
                this.refreshColorButtons(colBtn);
            });
            colBtn.on("pointerout", () => {
                this.tweens.add({ targets: colBtn, scaleX: 1.0, scaleY: 1.0, duration: 100 });
                this.refreshColorButtons();
            });
        });

        // Right panel: Tools - adjusted position
        const rightPanelX = this.canvasX + this.canvasWidth/2 + 70;
        

        // Pen button
        this.penBtn = this.add.rectangle(rightPanelX, 220, 90, 50, 0x3fa0ff)
            .setStrokeStyle(4, 0xffff00)
            .setInteractive({ useHandCursor: true });
        this.add.text(rightPanelX, 220, "✏️ PEN", { fontSize: "16px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5);

        this.penBtn.on("pointerdown", () => {
            this.currentTool = "pen";
            this.updateToolButtons();
        });

        this.penBtn.on("pointerover", () => this.tweens.add({ targets: this.penBtn, scaleX: 1.08, scaleY: 1.08, duration: 100 }));
        this.penBtn.on("pointerout", () => this.tweens.add({ targets: this.penBtn, scaleX: 1.0, scaleY: 1.0, duration: 100 }));

        // Eraser button
        this.eraserBtn = this.add.rectangle(rightPanelX, 290, 90, 50, 0xcccccc)
            .setStrokeStyle(2, 0xffffff)
            .setInteractive({ useHandCursor: true });
        this.add.text(rightPanelX, 290, "🧹 ERASE", { fontSize: "14px", color: "#333333", fontStyle: "bold" }).setOrigin(0.5);

        this.eraserBtn.on("pointerdown", () => {
            this.currentTool = "eraser";
            this.updateToolButtons();
        });

        this.eraserBtn.on("pointerover", () => this.tweens.add({ targets: this.eraserBtn, scaleX: 1.08, scaleY: 1.08, duration: 100 }));
        this.eraserBtn.on("pointerout", () => this.tweens.add({ targets: this.eraserBtn, scaleX: 1.0, scaleY: 1.0, duration: 100 }));

        // Drawing interaction
        this.board.setInteractive();

        this.input.on("pointerdown", (pointer) => {
            if (this.isPointInBoard(pointer)) {
                this.isDrawing = true;
                this.lastX = pointer.x;
                this.lastY = pointer.y;
                this.drawStroke(pointer.x, pointer.y, pointer.x, pointer.y);
            }
        });

        this.input.on("pointermove", (pointer) => {
            if (!this.isDrawing) return;
            if (!this.isPointInBoard(pointer)) {
                this.isDrawing = false;
                stopSfx("draw-active");
                return;
            }

            this.drawStroke(this.lastX, this.lastY, pointer.x, pointer.y);

            this.lastX = pointer.x;
            this.lastY = pointer.y;
        });

        this.input.on("pointerup", () => {
            this.isDrawing = false;
            stopSfx("draw-active");
        });

        // Bottom buttons
        uiButton(this, 220, 720, 160, 56, "🗑️ CLEAR", () => this.clearDrawing(), 0xffb36b, 0xff9b49);
        uiButton(this, 410, 720, 170, 56, "💾 SAVE +5", () => this.saveArt(), 0x6acc87, 0x51b970);
        uiButton(this, W - 110, 720, 160, 56, "HOME", () => this.scene.start("HubScene"), 0xff7d7d, 0xff5858);

        this.refreshSketchButtons();
        this.refreshColorButtons();
        this.updateToolButtons();
    }

    redrawBoard() {
        this.drawLayers.forEach((layer, idx) => {
            layer.setVisible(idx === this.currentSketchIdx);
        });
        this.graphics = this.drawLayers[this.currentSketchIdx];

        if (this.templateGuide) {
            this.templateGuide.destroy();
        }
        this.templateGuide = SKETCH_TEMPLATES[this.currentSketchIdx].guide(this, this.canvasX, this.canvasY);
        // Keep wireframe above drawing strokes so the guide is always visible.
        this.templateGuide.setDepth(9);
    }

    refreshSketchButtons() {
        this.sketchButtons.forEach((entry) => {
            const selected = entry.idx === this.currentSketchIdx;
            entry.btn.setFillStyle(selected ? 0x4db8ff : 0x9db4ff);
            entry.btn.setStrokeStyle(3, selected ? 0xffff00 : 0xffffff);
            entry.label.setScale(selected ? 1.06 : 1.0);
        });
    }

    refreshColorButtons(hoveredButton = null) {
        this.colorButtons.forEach((entry) => {
            const selected = entry.color === this.currentColor;
            const hovered = hoveredButton === entry.btn;
            let strokeWidth = selected ? 6 : 3;
            let strokeColor = selected ? 0xffff00 : 0xffffff;

            if (hovered && !selected) {
                strokeWidth = 5;
                strokeColor = 0xfff0a0;
            }

            entry.btn.setStrokeStyle(strokeWidth, strokeColor);
        });
    }

    drawStroke(x1, y1, x2, y2) {
        if (this.time.now - this.lastDrawSoundAt > 120) {
            if (this.currentTool === "pen") {
                playSfx("draw", {
                    volume: 0.15,
                    rate: 1.03,
                    durationMs: 150,
                    instanceKey: "draw-active",
                    replaceExisting: true,
                });
            } else {
                playSfx("hit", { volume: 0.1, rate: 1.35 });
            }
            this.lastDrawSoundAt = this.time.now;
        }
        if (this.currentTool === "pen") {
            this.graphics.lineStyle(7, this.currentColor, 0.95);
        } else {
            // Eraser: draw with canvas color.
            this.graphics.lineStyle(12, 0xf7fbff, 1.0);
        }
        this.graphics.beginPath();
        this.graphics.moveTo(x1, y1);
        this.graphics.lineTo(x2, y2);
        this.graphics.strokePath();
    }

    updateToolButtons() {
        if (this.currentTool === "pen") {
            this.penBtn.setStrokeStyle(4, 0xffff00);
            this.eraserBtn.setStrokeStyle(2, 0xffffff);
        } else {
            this.penBtn.setStrokeStyle(2, 0xffffff);
            this.eraserBtn.setStrokeStyle(4, 0xffff00);
        }
    }

    isPointInBoard(pointer) {
        const left = this.canvasX - this.canvasWidth/2;
        const right = this.canvasX + this.canvasWidth/2;
        const top = this.canvasY - this.canvasHeight/2;
        const bottom = this.canvasY + this.canvasHeight/2;
        return pointer.x > left && pointer.x < right && pointer.y > top && pointer.y < bottom;
    }

    clearDrawing() {
        playSfx("hit", { volume: 0.25, rate: 0.82 });
        // Clear only the drawings, not the entire scene
        this.graphics.clear();
        const msg = this.add.text(this.canvasX, this.canvasY, "Drawing Cleared!", {
            fontSize: "32px",
            color: "#ff6b35",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(250);
        this.tweens.add({
            targets: msg,
            alpha: 0,
            y: msg.y - 40,
            duration: 1000,
            onComplete: () => msg.destroy()
        });
    }

    saveArt() {
        playSfx("coin", { volume: 0.33, rate: 1.02 });
        STATE.coins += 5;
        STATE.mood = Math.min(100, STATE.mood + 3);
        const box = this.add.rectangle(this.canvasX, 640, 390, 50, 0x1f2a44, 0.9)
            .setStrokeStyle(3, 0xffffff)
            .setDepth(200);
        const msg = this.add.text(this.canvasX, 640, "Artwork saved! Coins +5", {
            fontSize: "22px",
            color: "#ffffff",
            fontStyle: "bold"
        }).setOrigin(0.5).setDepth(201);
        this.tweens.add({
            targets: [box, msg],
            y: 604,
            alpha: 0,
            duration: 1200,
            onComplete: () => {
                box.destroy();
                msg.destroy();
            },
        });
    }
}

class ShopScene extends Phaser.Scene {
    constructor() {
        super("ShopScene");
    }

    create() {
        setSceneMusic("background");
        this.worldWidth = 4600;
        this.floorY = 640;
        this.carryingCart = false;
        this.cartItems = [];
        this.totalCost = 0;
        this.unloaded = false;
        this.checkoutDue = 0;
        this.waitingForPayment = false;

        this.add.rectangle(this.worldWidth / 2, 210, this.worldWidth, 420, 0xe8f1ff);
        this.add.rectangle(this.worldWidth / 2, this.floorY + 40, this.worldWidth, 220, 0xcfd8dc);
        this.add.rectangle(this.worldWidth / 2, this.floorY + 10, this.worldWidth, 22, 0x9aa7b1);

        this.sections = [
            { name: "Produce", x: 720, color: 0x9be58f, items: [
                { name: "Tomato", shape: "round", color: 0xd93333 },
                { name: "Banana", shape: "long", color: 0xf7d04a },
                { name: "Carrot", shape: "cone", color: 0xe67e22 },
                { name: "Broccoli", shape: "crown", color: 0x2a9d4b },
            ] },
            { name: "Dairy", x: 1550, color: 0x99d6ff, items: [
                { name: "Milk", shape: "box", color: 0xf0f7ff },
                { name: "Cheddar", shape: "block", color: 0xf4cf62 },
                { name: "Yogurt", shape: "cup", color: 0xf1e09e },
                { name: "Eggs", shape: "oval", color: 0xfff1d6 },
            ] },
            { name: "Bakery", x: 2380, color: 0xffd38f, items: [
                { name: "Sourdough", shape: "loaf", color: 0xc98b53 },
                { name: "Croissant", shape: "crescent", color: 0xd9a15f },
                { name: "Muffin", shape: "cup", color: 0xf0b8cb },
                { name: "Bagel", shape: "ring", color: 0x9c6b39 },
            ] },
            { name: "Household", x: 3210, color: 0xcdb4ff, items: [
                { name: "Soap", shape: "box", color: 0x6ec3ff },
                { name: "Tissue", shape: "box", color: 0xf0f0f0 },
                { name: "Shampoo", shape: "bottle", color: 0x7cb5ff },
                { name: "Detergent", shape: "bottle", color: 0xff8f8f },
            ] },
            { name: "Frozen", x: 3920, color: 0xa7ecff, items: [
                { name: "Frozen Peas", shape: "box", color: 0x9dd6b8 },
                { name: "Salmon", shape: "long", color: 0xff8c69 },
                { name: "Pizza", shape: "round", color: 0xe5b35f },
                { name: "Berries", shape: "oval", color: 0x9d7ad6 },
            ] },
        ];

        this.sections.forEach((sec) => this.buildSection(sec));

        this.checkoutX = this.worldWidth - 180;
        this.add.rectangle(this.checkoutX, this.floorY - 20, 370, 220, 0xd7e3ec).setDepth(8).setStrokeStyle(4, 0xffffff);
        this.add.rectangle(this.checkoutX - 24, this.floorY - 14, 240, 22, 0x3f4f5f).setDepth(9);
        this.add.rectangle(this.checkoutX + 106, this.floorY - 44, 84, 54, 0x27333f).setDepth(10).setStrokeStyle(2, 0x8fb6d8);
        this.add.rectangle(this.checkoutX + 106, this.floorY - 62, 62, 14, 0x5ec878).setDepth(11);
        this.add.rectangle(this.checkoutX - 122, this.floorY - 32, 56, 30, 0x18232d).setDepth(10).setStrokeStyle(1, 0xb2d4f0);
        this.add.rectangle(this.checkoutX - 122, this.floorY - 4, 74, 7, 0xff4b4b).setDepth(11);
        this.add.text(this.checkoutX + 106, this.floorY - 63, "OPEN", { fontSize: "11px", color: "#0f2e18", fontStyle: "bold" }).setOrigin(0.5).setDepth(12);
        this.add.text(this.checkoutX, this.floorY - 120, "CHECKOUT", {
            fontSize: "30px",
            color: "#114e8c",
            fontStyle: "bold",
            stroke: "#ffffff",
            strokeThickness: 2,
        }).setOrigin(0.5).setDepth(9);
        this.add.text(this.checkoutX + 122, this.floorY - 104, "TESCO", {
            fontSize: "24px",
            color: "#00539f",
            fontStyle: "bold",
            stroke: "#ffffff",
            strokeThickness: 2,
        }).setDepth(12);

        // Cashier animal at register for a clearer checkout flow.
        // Chair for cashier
        const chairX = this.checkoutX - 172;
        const chairY = this.floorY - 32;
        this.add.rectangle(chairX, chairY, 52, 12, 0x4a3829).setDepth(17); // Seat
        this.add.rectangle(chairX, chairY - 32, 8, 48, 0x5c4a38).setDepth(17); // Backrest
        this.add.rectangle(chairX - 18, chairY + 8, 6, 12, 0x3d2e1f).setDepth(17); // Left leg
        this.add.rectangle(chairX + 18, chairY + 8, 6, 12, 0x3d2e1f).setDepth(17); // Right leg
        
        this.cashier = drawBear(this, this.checkoutX - 172, this.floorY - 92, 0.58).setDepth(18);
        this.add.text(this.checkoutX - 172, this.floorY - 148, "Cashier", {
            fontSize: "16px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#173248",
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(19);

        this.player = drawCroc(this, 180, this.floorY - 50, 0.78).setDepth(20);
        this.physics.add.existing(this.player);
        this.player.body.setAllowGravity(false);
        this.player.body.setSize(180, 76, true);
        this.player.body.setCollideWorldBounds(true);

        this.cart = this.add.container(340, this.floorY - 18).setDepth(19);
        const basket = this.add.rectangle(0, -10, 145, 82, 0xc5d1dd).setStrokeStyle(4, 0x5e6c79);
        const handle = this.add.rectangle(-74, -44, 8, 50, 0x6d7b88);
        const wheelL = this.add.circle(-46, 28, 12, 0x2f3b46);
        const wheelR = this.add.circle(46, 28, 12, 0x2f3b46);
        this.cart.add([basket, handle, wheelL, wheelR]);

        this.products = [];
        this.spawnProducts();
        this.shoppingTargets = Phaser.Utils.Array.Shuffle([...this.products]).slice(0, 7).map((p) => p.id);

        this.physics.world.setBounds(0, 0, this.worldWidth, H);
        this.cameras.main.setBounds(0, 0, this.worldWidth, H);
        this.cameras.main.startFollow(this.player, true, 0.09, 0.09, -W * 0.18, 20);

        this.add.text(W / 2, 46, "SUPERMARKET RUN", {
            fontSize: "46px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#36485c",
            strokeThickness: 5,
        }).setOrigin(0.5).setScrollFactor(0);

        this.coinText = this.add.text(24, 26, `Coins: ${STATE.coins}`, {
            fontSize: "24px",
            color: "#fff7c2",
            fontStyle: "bold",
            stroke: "#000",
            strokeThickness: 2,
        }).setScrollFactor(0);
        this.cartText = this.add.text(24, 56, "Cart: 0 items", {
            fontSize: "22px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#000",
            strokeThickness: 2,
        }).setScrollFactor(0);
        this.sectionText = this.add.text(24, 86, "Section: Entrance", {
            fontSize: "20px",
            color: "#d7f5ff",
            fontStyle: "bold",
            stroke: "#000",
            strokeThickness: 2,
        }).setScrollFactor(0);
        this.statusText = this.add.text(W / 2, H - 34, "Press E to pick items/trolley | R unload | P pay at checkout", {
            fontSize: "20px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#000",
            strokeThickness: 2,
        }).setOrigin(0.5).setScrollFactor(0);
        this.paymentText = this.add.text(24, 116, "Due: $0", {
            fontSize: "20px",
            color: "#ffe39b",
            fontStyle: "bold",
            stroke: "#000",
            strokeThickness: 2,
        }).setScrollFactor(0);
        this.listText = this.add.text(W - 20, 26, "", {
            fontSize: "18px",
            color: "#ffffff",
            fontStyle: "bold",
            align: "right",
            stroke: "#000",
            strokeThickness: 2,
            wordWrap: { width: 300 },
        }).setOrigin(1, 0).setScrollFactor(0);
        this.updateListText();

        this.keys = this.input.keyboard.addKeys({
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            e: Phaser.Input.Keyboard.KeyCodes.E,
            r: Phaser.Input.Keyboard.KeyCodes.R,
            p: Phaser.Input.Keyboard.KeyCodes.P,
            arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
            arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        });
        this.phoneControls = createPhoneControls(this, { e: true, r: true, p: true });

        // Pop-out HOME button with glowing shadow for clear visibility
        const homeShadow = this.add.rectangle(W - 95, H - 36, 202, 70, 0xffcc00, 0.38).setDepth(98).setScrollFactor(0);
        this.tweens.add({ targets: homeShadow, alpha: 0.08, scaleX: 1.25, scaleY: 1.45, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        const homeBtn = uiButton(this, W - 95, H - 36, 182, 58, "HOME", () => this.scene.start("HubScene"), 0xff3030, 0xff0000);
        homeBtn.btn.setScrollFactor(0).setStrokeStyle(5, 0xffffff).setDepth(99);
        homeBtn.label.setScrollFactor(0).setDepth(100);
    }

    buildSection(section) {
        this.add.rectangle(section.x, this.floorY - 90, 520, 280, 0xffffff, 0.62).setDepth(6).setStrokeStyle(4, section.color);
        this.add.rectangle(section.x, this.floorY - 210, 520, 32, section.color, 0.95).setDepth(7);
        this.add.text(section.x, this.floorY - 180, section.name, {
            fontSize: "22px",
            color: "#1f2d3b",
            fontStyle: "bold",
        }).setOrigin(0.5).setDepth(8);
        this.add.rectangle(section.x - 160, this.floorY - 58, 190, 12, 0x798690).setDepth(8);
        this.add.rectangle(section.x + 160, this.floorY - 58, 190, 12, 0x798690).setDepth(8);
        this.add.rectangle(section.x, this.floorY - 124, 350, 10, 0x798690).setDepth(8);
    }

    spawnProducts() {
        this.sections.forEach((section) => {
            section.items.forEach((item, idx) => {
                const x = section.x - 180 + idx * 120;
                const y = this.floorY - 86 - (idx % 2) * 52;
                const p = this.add.container(x, y).setDepth(10);
                this.buildProductVisual(p, item);
                p.id = `${section.name}-${item.name}-${idx}`;
                p.section = section.name;
                p.itemName = item.name;
                p.price = Phaser.Math.Between(8, 26);
                p.collected = false;
                this.products.push(p);
            });
        });
    }

    buildProductVisual(container, item) {
        const frame = this.add.rectangle(0, 0, 66, 74, 0xffffff).setStrokeStyle(2, 0x9fb0be);
        const topBand = this.add.rectangle(0, -30, 62, 14, 0xeff4f8);
        const shadow = this.add.ellipse(0, 29, 40, 8, 0x000000, 0.16);
        const heroGlow = this.add.circle(0, -6, 17, 0xffffff, 0.25);
        container.add([shadow, frame, topBand, heroGlow]);

        let shapeObj = null;
        if (item.shape === "round") {
            shapeObj = this.add.container(0, -8);
            shapeObj.add([
                this.add.circle(0, 0, 14, item.color),
                this.add.circle(-5, -4, 4, 0xffffff, 0.32)
            ]);
        }
        if (item.shape === "long") {
            shapeObj = this.add.ellipse(0, -8, 30, 14, item.color).setAngle(-14);
            shapeObj.setStrokeStyle(1, 0xd8b14a);
        }
        if (item.shape === "cone") {
            shapeObj = this.add.container(0, -8);
            shapeObj.add([
                this.add.triangle(0, 2, -10, 10, 10, 10, 0, -14, item.color),
                this.add.rectangle(0, -14, 4, 8, 0x4f8f2f)
            ]);
        }
        if (item.shape === "crown") {
            shapeObj = this.add.container(0, -9);
            shapeObj.add([
                this.add.circle(-9, 2, 8, item.color),
                this.add.circle(0, -3, 10, item.color),
                this.add.circle(9, 2, 8, item.color),
                this.add.rectangle(0, 10, 20, 5, 0x427d3a)
            ]);
        }
        if (item.shape === "box") {
            shapeObj = this.add.container(0, -8);
            shapeObj.add([
                this.add.rectangle(0, 0, 24, 19, item.color).setStrokeStyle(1, 0x6b6b6b),
                this.add.rectangle(0, -7, 20, 4, 0xffffff, 0.38)
            ]);
        }
        if (item.shape === "block") {
            shapeObj = this.add.container(0, -8);
            shapeObj.add([
                this.add.rectangle(0, 0, 24, 14, item.color).setStrokeStyle(1, 0x6b6b6b),
                this.add.rectangle(0, -3, 18, 3, 0xffffff, 0.34)
            ]);
        }
        if (item.shape === "oval") {
            shapeObj = this.add.container(0, -8);
            shapeObj.add([
                this.add.ellipse(0, 0, 24, 16, item.color),
                this.add.ellipse(-4, -3, 7, 5, 0xffffff, 0.25)
            ]);
        }
        if (item.shape === "loaf") {
            shapeObj = this.add.container(0, -8);
            shapeObj.add([
                this.add.ellipse(0, 0, 30, 18, item.color),
                this.add.line(-4, -2, -8, 0, 8, 0, 0xffffff).setLineWidth(1, 1).setAlpha(0.45)
            ]);
        }
        if (item.shape === "crescent") {
            shapeObj = this.add.container(0, -8);
            shapeObj.add([
                this.add.ellipse(0, 0, 28, 16, item.color),
                this.add.ellipse(4, -2, 18, 10, 0xffffff, 0.52)
            ]);
        }
        if (item.shape === "cup") {
            shapeObj = this.add.container(0, -10);
            shapeObj.add([
                this.add.rectangle(0, -1, 24, 7, item.color),
                this.add.triangle(0, 8, -10, 0, 10, 0, 0, 15, item.color),
                this.add.rectangle(0, -3, 16, 2, 0xffffff, 0.34)
            ]);
        }
        if (item.shape === "ring") {
            shapeObj = this.add.container(0, -8);
            shapeObj.add([
                this.add.circle(0, 0, 11, item.color),
                this.add.circle(0, 0, 5, 0xffffff)
            ]);
        }
        if (item.shape === "bottle") {
            shapeObj = this.add.container(0, -8);
            shapeObj.add([
                this.add.rectangle(0, 5, 16, 20, item.color).setStrokeStyle(1, 0x6b6b6b),
                this.add.rectangle(0, -8, 8, 8, item.color),
                this.add.rectangle(0, -15, 6, 3, 0x2f3f4e),
                this.add.rectangle(-4, 4, 3, 12, 0xffffff, 0.3)
            ]);
        }
        if (shapeObj) container.add(shapeObj);

        const priceTag = this.add.text(-24, -30, `$${Phaser.Math.Between(2, 9)}`, {
            fontSize: "8px",
            color: "#204860",
            fontStyle: "bold",
        }).setOrigin(0, 0.5);
        const label = this.add.text(0, 20, item.name.toUpperCase(), {
            fontSize: "8px",
            color: "#1f2d3b",
            fontStyle: "bold",
            align: "center",
        }).setOrigin(0.5);
        container.add([priceTag, label]);
    }

    updateListText() {
        const left = this.shoppingTargets.filter((id) => {
            const product = this.products.find((p) => p.id === id);
            return !(product && product.collected);
        });
        this.listText.setText(`Shopping List (${left.length})\n${left.slice(0, 7).map((id) => `- ${id.split("-")[1]}`).join("\n")}`);
    }

    tryInteract() {
        const cartDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.cart.x, this.cart.y);
        if (!this.carryingCart && cartDist < 150) {
            this.carryingCart = true;
            playSfx("cart", { volume: 0.32, rate: 1.0 });
            this.statusText.setText("Trolley attached. Search sections for your list.");
            return;
        }

        const nearProduct = this.products
            .filter((p) => !p.collected)
            .map((p) => ({ p, d: Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) }))
            .filter((it) => it.d < 120)
            .sort((a, b) => a.d - b.d)[0];

        if (nearProduct) {
            if (!this.carryingCart) {
                this.statusText.setText("Pick up the trolley first.");
                return;
            }
            this.collectProduct(nearProduct.p);
            return;
        }

        this.statusText.setText("Nothing to interact with here.");
    }

    collectProduct(p) {
        p.collected = true;
        playSfx("coin", { volume: 0.28, rate: 1.1 });
        this.cartItems.push(p);
        // Track food-section items for future fridge stocking
        const foodSections = ["Produce", "Dairy", "Bakery", "Frozen"];
        if (foodSections.includes(p.section)) {
            if (!this.pendingFridgeItems) this.pendingFridgeItems = [];
            this.pendingFridgeItems.push({ name: p.itemName, section: p.section });
        }
        this.totalCost += p.price;
        this.cartText.setText(`Cart: ${this.cartItems.length} items ($${this.totalCost})`);
        this.updateListText();

        const slot = this.cartItems.length - 1;
        p.cartSlot = slot;
        const slotX = this.cart.x - 40 + (slot % 4) * 24;
        const slotY = this.cart.y - 6 + Math.floor(slot / 4) * 13;
        this.tweens.add({
            targets: p,
            x: slotX,
            y: slotY,
            scale: 0.58,
            duration: 420,
            onComplete: () => {
                p.setAlpha(0.9).setDepth(21);
            },
        });

        this.statusText.setText(`Added ${p.itemName} from ${p.section}.`);
    }

    unloadCart() {
        if (this.unloaded || this.cartItems.length === 0) return;
        this.unloaded = true;

        const itemsToUnload = [...this.cartItems];
        const dueNow = this.totalCost;

        // Trolley becomes empty as soon as products are handed to checkout.
        this.cartItems = [];
        this.totalCost = 0;
        this.cartText.setText("Cart: 0 items");
        this.updateListText();

        this.statusText.setText("Unloading products at checkout...");
        itemsToUnload.forEach((item, idx) => {
            const token = this.add.rectangle(this.cart.x, this.cart.y - 12, 34, 34, 0xffffff).setStrokeStyle(2, 0xb9c3cc).setDepth(40);
            const tokenLabel = this.add.text(token.x, token.y + 20, item.itemName.substring(0, 4).toUpperCase(), {
                fontSize: "8px",
                color: "#1f2d3b",
                fontStyle: "bold",
            }).setOrigin(0.5).setDepth(41);
            this.tweens.add({
                targets: [token, tokenLabel],
                x: this.checkoutX + Phaser.Math.Between(-40, 40),
                y: this.floorY - 18,
                scale: 0.7,
                duration: 450,
                delay: idx * 130,
                onComplete: () => {
                    token.destroy();
                    tokenLabel.destroy();
                },
            });

            this.time.delayedCall(idx * 130 + 80, () => {
                const scan = this.add.text(this.checkoutX + 34, this.floorY - 84, "beep", {
                    fontSize: "16px",
                    color: "#c5f3ff",
                    fontStyle: "bold",
                    stroke: "#000",
                    strokeThickness: 2,
                }).setDepth(60);
                this.tweens.add({
                    targets: scan,
                    y: scan.y - 18,
                    alpha: 0,
                    duration: 300,
                    onComplete: () => scan.destroy(),
                });

                const pulse = this.add.rectangle(this.checkoutX + 106, this.floorY - 62, 62, 14, 0xb8ffcf, 0.85).setDepth(13);
                this.tweens.add({
                    targets: pulse,
                    alpha: 0,
                    duration: 120,
                    onComplete: () => pulse.destroy(),
                });
            });

            if (item && item.destroy) item.destroy();
        });

        this.time.delayedCall(itemsToUnload.length * 130 + 520, () => {
            this.checkoutDue += dueNow;
            this.waitingForPayment = this.checkoutDue > 0;
            this.paymentText.setText(`Due: $${this.checkoutDue}`);
            this.statusText.setText(`Items scanned. Amount due: $${this.checkoutDue}. Press P to pay.`);
            this.unloaded = false;
        });
    }

    payAtCheckout() {
        if (this.unloaded) return;
        if (!this.waitingForPayment || this.checkoutDue <= 0) {
            this.statusText.setText("No payment pending.");
            return;
        }

        if (STATE.coins < this.checkoutDue) {
            this.statusText.setText(`Need ${this.checkoutDue - STATE.coins} more coins for payment.`);
            return;
        }

        const card = this.add.rectangle(this.player.x + 18, this.player.y - 46, 44, 26, 0xf7f9fc)
            .setStrokeStyle(2, 0x6d87a2)
            .setDepth(70);
        this.add.rectangle(card.x - 10, card.y - 6, 16, 6, 0x5ec878).setDepth(71);

        this.tweens.add({
            targets: card,
            x: this.checkoutX + 106,
            y: this.floorY - 44,
            duration: 360,
            ease: "Quad.easeOut",
            onComplete: () => {
                card.destroy();
                const paid = this.checkoutDue;
                STATE.coins -= paid;
                STATE.mood = Math.min(100, STATE.mood + 10);
                STATE.energy = Math.max(20, STATE.energy - 5);
                // Save purchased food items to the global fridge
                if (this.pendingFridgeItems?.length) {
                    STATE.fridgeItems.push(...this.pendingFridgeItems);
                    this.pendingFridgeItems = [];
                }
                this.checkoutDue = 0;
                this.waitingForPayment = false;
                this.coinText.setText(`Coins: ${STATE.coins}`);
                this.paymentText.setText("Due: $0");
                this.statusText.setText(`Payment approved. Spent $${paid}.`);
                addToast(this, "Payment Complete", "#d2ffd4");

                const thanks = this.add.text(this.checkoutX - 190, this.floorY - 176, "Thank you!", {
                    fontSize: "20px",
                    color: "#ffffff",
                    fontStyle: "bold",
                    stroke: "#1c2e44",
                    strokeThickness: 3,
                }).setOrigin(0.5).setDepth(80);
                this.tweens.add({
                    targets: thanks,
                    y: thanks.y - 20,
                    alpha: 0,
                    duration: 900,
                    onComplete: () => thanks.destroy(),
                });
            },
        });
    }

    update() {
        let vx = 0;
        const speed = this.carryingCart ? 200 : 250;
        if (this.keys.left.isDown || this.keys.arrowLeft.isDown || this.phoneControls.isDown("left")) vx -= speed;
        if (this.keys.right.isDown || this.keys.arrowRight.isDown || this.phoneControls.isDown("right")) vx += speed;
        this.player.body.setVelocityX(vx);
        this.player.y = this.floorY - 50;

        if (vx > 8) {
            setCrocFacing(this.player, 1);
            setCrocExpression(this.player, "neutral");
        } else if (vx < -8) {
            setCrocFacing(this.player, -1);
            setCrocExpression(this.player, "focused");
        }

        const current = this.sections.find((s) => Math.abs(this.player.x - s.x) < 190);
        this.sectionText.setText(`Section: ${current ? current.name : "Entrance / Checkout"}`);

        if (this.carryingCart) {
            const dir = this.player.scaleX >= 0 ? 1 : -1;
            this.cart.x = this.player.x + dir * 130;
            this.cart.y = this.floorY - 18;

            this.cartItems.forEach((item) => {
                if (!item || !item.active) return;
                const slot = item.cartSlot || 0;
                item.x = this.cart.x - 40 + (slot % 4) * 24;
                item.y = this.cart.y - 6 + Math.floor(slot / 4) * 13;
            });
        }

        if (Phaser.Input.Keyboard.JustDown(this.keys.e) || this.phoneControls.consume("e")) {
            this.tryInteract();
        }

        if (Phaser.Input.Keyboard.JustDown(this.keys.r) || this.phoneControls.consume("r")) {
            const checkoutDist = Math.abs(this.player.x - this.checkoutX);
            if (!this.carryingCart) {
                this.statusText.setText("Attach trolley first.");
            } else if (checkoutDist > 210) {
                this.statusText.setText("Move to checkout and press R to unload.");
            } else if (this.cartItems.length === 0) {
                this.statusText.setText(this.waitingForPayment ? "Items already scanned. Press P to pay." : "Your trolley is empty.");
            } else {
                this.unloadCart();
            }
        }

        if (Phaser.Input.Keyboard.JustDown(this.keys.p) || this.phoneControls.consume("p")) {
            const checkoutDist = Math.abs(this.player.x - this.checkoutX);
            if (checkoutDist > 210) {
                this.statusText.setText("Move to checkout counter and press P to pay.");
            } else {
                this.payAtCheckout();
            }
        }
    }
}
/*
class WorkoutScene extends Phaser.Scene {
    constructor() {
        super("WorkoutScene");
    }

    create() {
        setSceneMusic("gym");
        this.worldWidth = 3800;
        this.floorY = 630;
        this.playerLocked = false;
        this.playerSpeed = 240;
        this.playerFacingDir = 1;
        this.reps = 0;
        this.totalCalories = 0;
        this.lastTalkAt = 0;
        this.machineFxTweens = [];
        this.machineFxObjects = [];
        this.machineFxTimers = [];
        this.currentMachineTimeout = null;
        this.currentMachineSafetyTimeout = null;
        this.machineUseActive = false;
        this.activeMachine = null;
        this.machineSessionId = 0;

        this.add.rectangle(this.worldWidth / 2, 220, this.worldWidth, 440, 0xd9e4ef);
        this.add.rectangle(this.worldWidth / 2, 650, this.worldWidth, 240, 0x4b4b4b);
        this.add.rectangle(this.worldWidth / 2, 430, this.worldWidth, 10, 0xb8c6d4);
        for (let i = 0; i < 36; i++) this.add.rectangle(80 + i * 108, 650, 70, 6, 0x666666);

        this.add.text(W / 2, 52, "CROC GYM ARENA", {
            fontSize: "48px", color: "#ffffff", fontStyle: "bold", stroke: "#1f3d66", strokeThickness: 5,
        }).setOrigin(0.5).setScrollFactor(0);

        this.repText = this.add.text(30, 28, "Reps: 0", { fontSize: "28px", color: "#ffffff", fontStyle: "bold", stroke: "#000", strokeThickness: 3 }).setScrollFactor(0);
        this.caloriesText = this.add.text(30, 62, "Calories: 0", { fontSize: "24px", color: "#ffe066", fontStyle: "bold", stroke: "#000", strokeThickness: 3 }).setScrollFactor(0);
        this.statusText = this.add.text(30, 150, "Walk to a machine and press E", { fontSize: "22px", color: "#ffffff", fontStyle: "bold", stroke: "#000", strokeThickness: 3 }).setScrollFactor(0);

        this.playerCroc = drawCroc(this, 220, this.floorY - 85, 0.8).setDepth(30);
        this.physics.add.existing(this.playerCroc);
        this.playerCroc.body.setAllowGravity(false);
        this.playerCroc.body.setSize(190, 80, true);
        this.playerCroc.body.setCollideWorldBounds(true);

        this.physics.world.setBounds(0, 0, this.worldWidth, H);
        this.cameras.main.setBounds(0, 0, this.worldWidth, H);
        this.cameras.main.startFollow(this.playerCroc, true, 0.09, 0.09, -W * 0.22, 20);

        this.machines = [];
        this.createMachineRecord("bench", "Bench Press", 520, this.floorY - 20, 490, this.floorY - 92, 4200, 16);
        this.createMachineRecord("cable", "Cable Row", 1030, this.floorY - 20, 1140, this.floorY - 92, 3800, 13);
        this.createMachineRecord("treadmill", "Treadmill", 1500, this.floorY - 15, 1500, this.floorY - 96, 4600, 22);
        this.createMachineRecord("bike", "Spin Bike", 1920, this.floorY - 18, 1950, this.floorY - 93, 4200, 18);
        this.createMachineRecord("water", "Hydration", 2280, this.floorY - 20, 2360, this.floorY - 92, 2600, 0);
        this.createMachineRecord("sauna", "Sauna", 2820, this.floorY - 25, 2820, this.floorY - 88, 5200, 0);
        this.createMachineRecord("stepper", "Stepper", 3360, this.floorY - 16, 3360, this.floorY - 93, 3900, 15);

        this.machines.forEach((m) => {
            this.drawMachineVisual(m);
            this.add.rectangle(m.x, m.y - 20, 220, 120, 0xffffff, 0.08).setStrokeStyle(3, 0x90a4b8).setDepth(8);
            this.add.text(m.x, m.y - 78, m.name, { fontSize: "18px", color: "#ffe082", fontStyle: "bold", stroke: "#000", strokeThickness: 2 }).setOrigin(0.5).setDepth(9);
            m.barBg = this.add.rectangle(m.x, m.y - 94, 110, 8, 0x1c1c1c, 0.95).setStrokeStyle(1, 0xffffff, 0.6).setDepth(12);
            m.barFill = this.add.rectangle(m.x - 54, m.y - 94, 0, 4, 0x67d6ff).setOrigin(0, 0.5).setDepth(13);
        });

        this.animalUsers = [
            this.createAnimalUser("Bear", drawBear(this, 860, this.floorY - 95, 0.75)),
            this.createAnimalUser("Panda", drawPanda(this, 1250, this.floorY - 95, 0.78)),
        ];

        this.keys = this.input.keyboard.addKeys({
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            e: Phaser.Input.Keyboard.KeyCodes.E,
            q: Phaser.Input.Keyboard.KeyCodes.Q,
            arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
            arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        });
        this.phoneControls = createPhoneControls(this, { e: true, q: true });

        this.animalAiEvent = this.time.addEvent({ delay: 700, loop: true, callback: () => this.updateAnimalAI() });

        const homeBtn = uiButton(this, W - 100, 44, 170, 52, "HOME", () => this.scene.start("HubScene"), 0xff7d7d, 0xff5858);
        homeBtn.btn.setScrollFactor(0);
        homeBtn.label.setScrollFactor(0);
        
        // Recovery mechanism: Check every 2 seconds if playerLocked is stuck
        this.machineStartTime = 0;
        this.recoveryEvent = this.time.addEvent({
            delay: 2000,
            loop: true,
            callback: () => {
                if (this.playerLocked && !this.machineUseActive) {
                    console.warn("⚠️ RECOVERY: playerLocked stuck - forcing unlock");
                    this.forceUnlockPlayer("Recovery check");
                }
                if (this.machineUseActive && this.machineStartTime > 0) {
                    const maxAllowed = (this.activeMachine?.durationMs || 6000) + 8000;
                    if (this.time.now - this.machineStartTime > maxAllowed) {
                        console.warn("⚠️ RECOVERY: machineUseActive stuck too long - forcing unlock");
                        this.forceUnlockPlayer("MachineActive timeout recovery");
                    }
                }
            }
        });
        registerSceneCleanup(this, () => this.cleanupWorkoutScene());
    }

    createAnimalUser(name, sprite) {
        sprite.setDepth(26);
        this.physics.add.existing(sprite);
        sprite.body.setAllowGravity(false);
        sprite.body.setSize(140, 90, true);
        sprite.body.setCollideWorldBounds(true);
        const nameTag = this.add.text(sprite.x, this.floorY - 2, name, { fontSize: "18px", color: "#ffffff", fontStyle: "bold", stroke: "#000", strokeThickness: 2 }).setOrigin(0.5, 1);
        const barBg = this.add.rectangle(sprite.x, sprite.y - 92, 90, 8, 0x1c1c1c, 0.92).setStrokeStyle(1, 0xffffff, 0.6).setDepth(28);
        const barFill = this.add.rectangle(sprite.x - 44, sprite.y - 92, 0, 4, 0x6de59d).setOrigin(0, 0.5).setDepth(29);
        return {
            name,
            sprite,
            nameTag,
            barBg,
            barFill,
            usingMachineId: null,
            cooldownUntil: this.time.now + Phaser.Math.Between(800, 2200),
            currentTween: null,
            activityTweens: [],
            footToggle: false,
            walkPace: name === "Bear" ? 1.45 : 1.05,
        };
    }

    createMachineRecord(id, name, x, y, useSpotX, useSpotY, durationMs, caloriesGain) {
        this.machines.push({ id, name, x, y, useSpotX, useSpotY, durationMs, caloriesGain, occupiedUntil: 0, occupiedBy: null, barBg: null, barFill: null });
    }

    drawMachineVisual(machine) {
        const x = machine.x;
        const y = machine.y;
        if (machine.id === "bench") {
            this.add.rectangle(x, y + 16, 220, 18, 0x3a3a3a).setDepth(7);
            this.add.rectangle(x, y - 10, 250, 10, 0x7b8a94).setDepth(8);
            this.add.circle(x - 124, y - 10, 26, 0x2d3e50).setDepth(8);
            this.add.circle(x + 124, y - 10, 26, 0x2d3e50).setDepth(8);
            return;
        }
        if (machine.id === "cable") {
            this.add.rectangle(x, y - 16, 88, 160, 0x4b5563).setDepth(7);
            this.add.rectangle(x + 82, y + 22, 78, 10, 0x808892).setDepth(8);
            this.add.rectangle(x, y + 36, 64, 12, 0x323b46).setDepth(8);
            return;
        }
        if (machine.id === "treadmill") {
            this.add.rectangle(x, y, 220, 70, 0x2f2f2f).setDepth(7).setStrokeStyle(3, 0x707070);
            this.add.rectangle(x, y - 12, 150, 14, 0x1a1a1a).setDepth(8);
            return;
        }
        if (machine.id === "bike") {
            this.add.circle(x - 48, y + 18, 28, 0x2e3a46).setDepth(7).setStrokeStyle(3, 0x91a3b0);
            this.add.rectangle(x + 20, y - 12, 54, 8, 0x7d8790).setDepth(8);
            return;
        }
        if (machine.id === "water") {
            this.add.rectangle(x, y - 34, 44, 90, 0x88d8ff).setDepth(7).setStrokeStyle(3, 0xffffff, 0.9);
            return;
        }
        if (machine.id === "sauna") {
            this.add.rectangle(x, y - 4, 260, 152, 0x8d6e63).setDepth(7).setStrokeStyle(5, 0x5d4037);
            return;
        }
        if (machine.id === "stepper") {
            this.add.rectangle(x, y + 10, 170, 16, 0x56606a).setDepth(7);
            this.add.rectangle(x - 30, y - 6, 54, 10, 0x21262a).setDepth(8);
            this.add.rectangle(x + 30, y - 2, 54, 10, 0x21262a).setDepth(8);
        }
    }

    reserveMachine(machine, userName, durationMs) {
        machine.occupiedBy = userName;
        machine.occupiedUntil = this.time.now + durationMs;
    }

    releaseMachine(machine, userName) {
        if (machine.occupiedBy !== userName) return;
        machine.occupiedBy = null;
        machine.occupiedUntil = 0;
    }

    clearMachineFX() {
        this.machineFxTimers.forEach((timer) => {
            if (timer) timer.remove(false);
        });
        this.machineFxTimers.length = 0;

        this.machineFxTweens.forEach((tw) => {
            if (!tw) return;
            tw.stop?.();
            tw.remove?.();
        });
        this.machineFxTweens.length = 0;

        this.machineFxObjects.forEach((obj) => {
            if (obj && obj.active) obj.destroy();
        });
        this.machineFxObjects.length = 0;

        if (this.playerCroc?.active) {
            this.tweens.killTweensOf(this.playerCroc);
            setCrocExpression(this.playerCroc, "neutral");
        }
    }


    resetPlayerAfterMachine() {
        if (!this.playerCroc || !this.playerCroc.body) return;
        this.tweens.killTweensOf(this.playerCroc);
        const baseScale = Math.abs(this.playerCroc.baseScale || 0.8);
        this.playerCroc.body.setVelocity(0, 0);
        this.playerCroc.angle = 0;
        this.playerCroc.rotation = 0;
        this.playerCroc.setScale(baseScale, baseScale);
        this.playerCroc.setTint(0xffffff);
        this.playerCroc.setAlpha(1);
        this.playerCroc.y = this.floorY - 85;
        setCrocFacing(this.playerCroc, this.playerFacingDir);
    }

    clearMachineTimeouts() {
        if (this.currentMachineTimeout) {
            this.currentMachineTimeout.remove(false);
            this.currentMachineTimeout = null;
        }
        if (this.currentMachineSafetyTimeout) {
            this.currentMachineSafetyTimeout.remove(false);
            this.currentMachineSafetyTimeout = null;
        }
    }

    cleanupWorkoutScene() {
        this.clearMachineTimeouts();
        this.clearMachineFX();

        if (this.animalAiEvent) this.animalAiEvent.remove(false);
        if (this.recoveryEvent) this.recoveryEvent.remove(false);

        this.animalUsers?.forEach((animal) => {
            if (animal.activityTweens?.length) {
                animal.activityTweens.forEach((tw) => tw && tw.remove && tw.remove());
                animal.activityTweens = [];
            }
            if (animal.currentTween) {
                animal.currentTween.stop();
                animal.currentTween = null;
            }
        });
    }

    forceUnlockPlayer(reason = "Unknown") {
        console.log(`🔓 UNLOCKING PLAYER: ${reason}`);

        this.machineSessionId += 1;
        
        // Stop the progress bar fill tweens on machines
        this.machines.forEach(m => {
            if (m.barFill) this.tweens.killTweensOf(m.barFill);
        });

        this.clearMachineTimeouts();
        this.clearMachineFX(); // This now clears all the lag-causing objects

        this.animalUsers.forEach((animal) => {
            if (animal.activityTweens?.length) {
                animal.activityTweens.forEach((tw) => tw && tw.remove && tw.remove());
                animal.activityTweens = [];
            }
            if (animal.sprite?.bearParts) {
                animal.sprite.bearParts.legPivotL.angle = 0;
                animal.sprite.bearParts.legPivotR.angle = 0;
                animal.sprite.bearParts.bodyPivot.angle = 0;
            }
        });

        if (this.activeMachine) {
            this.releaseMachine(this.activeMachine, "Crocodile");
            this.activeMachine = null;
        }

        this.playerLocked = false;
        this.machineUseActive = false;
        this.resetPlayerAfterMachine();
        
        if (this.statusText) {
            this.statusText.setText("Ready. Press E on a machine");
        }
    }

    startMachineFX(machine) {
        this.clearMachineFX();
        const baseScale = Math.abs(this.playerCroc.baseScale || 0.8);

        const spawnSweat = (steam = false) => {
            const timer = this.time.addEvent({
                delay: 340,
                loop: true,
                callback: () => {
                    if (!this.machineUseActive || !this.playerLocked || !this.playerCroc?.active) return;
                    if (this.machineFxObjects.length > 14) return;

                    const p = this.add.circle(
                        this.playerCroc.x + Phaser.Math.Between(-12, 12),
                        this.playerCroc.y - Phaser.Math.Between(50, 70),
                        3,
                        steam ? 0xffffff : 0x86d5ff,
                        0.78
                    ).setDepth(24);
                    this.machineFxObjects.push(p);

                    const tw = this.tweens.add({
                        targets: p,
                        y: p.y - 20,
                        alpha: 0,
                        duration: 620,
                        ease: "Quad.easeOut",
                        onComplete: () => {
                            if (p && p.active) p.destroy();
                        },
                    });
                    this.machineFxTweens.push(tw);
                }
            });
            this.machineFxTimers.push(timer);
        };

        if (machine.id === "treadmill") {
            setCrocExpression(this.playerCroc, "focused");
            this.machineFxTweens.push(this.tweens.add({
                targets: this.playerCroc,
                y: this.playerCroc.y - 6,
                duration: 200,
                yoyo: true,
                repeat: -1,
            }));

            const beltL = this.add.rectangle(machine.x - 22, machine.y + 6, 24, 4, 0x3a3a3a, 0.8).setDepth(10);
            const beltR = this.add.rectangle(machine.x + 22, machine.y + 6, 24, 4, 0x3a3a3a, 0.8).setDepth(10);
            this.machineFxObjects.push(beltL, beltR);
            this.machineFxTweens.push(this.tweens.add({ targets: [beltL, beltR], x: "-=14", duration: 220, yoyo: true, repeat: -1 }));
            spawnSweat(false);
            return;
        }

        if (machine.id === "bench") {
            setCrocExpression(this.playerCroc, "strain");
            const bar = this.add.rectangle(this.playerCroc.x, this.playerCroc.y - 78, 108, 12, 0x999999).setDepth(21);
            this.machineFxObjects.push(bar);
            this.machineFxTweens.push(this.tweens.add({
                targets: [bar, this.playerCroc],
                y: "-=14",
                duration: 320,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
            }));
            spawnSweat(false);
            return;
        }

        if (machine.id === "cable") {
            setCrocExpression(this.playerCroc, "focused");
            const handle = this.add.rectangle(this.playerCroc.x + 22, this.playerCroc.y - 10, 24, 10, 0x7a7a7a).setDepth(21);
            this.machineFxObjects.push(handle);
            this.machineFxTweens.push(this.tweens.add({
                targets: [this.playerCroc, handle],
                x: "-=12",
                duration: 260,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
            }));
            spawnSweat(false);
            return;
        }

        if (machine.id === "bike") {
            setCrocExpression(this.playerCroc, "focused");
            const wheel = this.add.circle(machine.x + 56, machine.y + 46, 16).setStrokeStyle(3, 0x666666).setDepth(10);
            this.machineFxObjects.push(wheel);
            this.machineFxTweens.push(this.tweens.add({
                targets: wheel,
                angle: 360,
                duration: 500,
                repeat: -1,
                ease: "Linear",
            }));
            this.machineFxTweens.push(this.tweens.add({
                targets: this.playerCroc,
                y: this.playerCroc.y - 6,
                scaleX: baseScale * 1.01,
                scaleY: baseScale * 0.99,
                duration: 170,
                yoyo: true,
                repeat: -1,
            }));
            spawnSweat(false);
            return;
        }

        if (machine.id === "stepper") {
            setCrocExpression(this.playerCroc, "focused");
            const step = this.tweens.add({
                targets: this.playerCroc,
                y: this.playerCroc.y - 6,
                duration: 180,
                yoyo: true,
                repeat: -1,
            });
            this.machineFxTweens.push(step);
            spawnSweat(false);
            return;
        }

        if (machine.id === "sauna") {
            setCrocExpression(this.playerCroc, "happy");
            const relax = this.tweens.add({
                targets: this.playerCroc,
                y: this.playerCroc.y - 2,
                duration: 500,
                yoyo: true,
                repeat: -1,
            });
            this.machineFxTweens.push(relax);
            spawnSweat(true);
            return;
        }

        if (machine.id === "water") {
            setCrocExpression(this.playerCroc, "happy");
            const jet = this.add.rectangle(machine.x + 78, machine.y - 52, 8, 22, 0x7ad6ff).setDepth(10);
            this.machineFxObjects.push(jet);
            this.machineFxTweens.push(this.tweens.add({
                targets: jet,
                alpha: 0.2,
                duration: 200,
                yoyo: true,
                repeat: -1,
            }));
        }
    }


    updateAnimalAI() {
        this.animalUsers.forEach((animal) => {
            if (animal.usingMachineId || animal.currentTween || this.time.now < animal.cooldownUntil) return;

            if (animal.activityTweens?.length) {
                animal.activityTweens.forEach((tw) => tw && tw.remove && tw.remove());
                animal.activityTweens = [];
            }

            const free = this.machines.filter((m) => this.time.now >= m.occupiedUntil);
            if (!free.length) return;
            const machine = Phaser.Utils.Array.GetRandom(free);
            const duration = Phaser.Math.Between(5300, 7600);
            this.reserveMachine(machine, animal.name, duration);
            animal.usingMachineId = machine.id;

            const dir = machine.useSpotX < animal.sprite.x ? -1 : 1;
            if (animal.sprite.bearParts) {
                animal.sprite.setScale(dir * Math.abs(animal.sprite.scaleX), Math.abs(animal.sprite.scaleY));
            } else {
                setCrocFacing(animal.sprite, dir);
            }

            if (animal.name === "Bear" && animal.sprite.bearParts) {
                const legTw = this.tweens.add({
                    targets: [animal.sprite.bearParts.legPivotL, animal.sprite.bearParts.legPivotR],
                    angle: { from: -11, to: 11 },
                    duration: 260,
                    yoyo: true,
                    repeat: -1,
                });
                const bodyTw = this.tweens.add({
                    targets: animal.sprite.bearParts.bodyPivot,
                    angle: { from: -4, to: 4 },
                    duration: 320,
                    yoyo: true,
                    repeat: -1,
                });
                animal.activityTweens.push(legTw, bodyTw);
            }

            const walkDistance = Math.abs(animal.sprite.x - machine.useSpotX);
            const walkDuration = Phaser.Math.Clamp(Math.floor(walkDistance * 10 * animal.walkPace), 1800, 4200);
            animal.currentTween = this.tweens.add({
                targets: animal.sprite,
                x: machine.useSpotX,
                y: machine.useSpotY,
                duration: walkDuration,
                ease: "Linear",
                onComplete: () => {
                    animal.currentTween = null;
                }
            });

            this.time.delayedCall(duration, () => {
                animal.usingMachineId = null;
                animal.cooldownUntil = this.time.now + Phaser.Math.Between(4500, 9000);
                this.releaseMachine(machine, animal.name);
                if (animal.activityTweens?.length) {
                    animal.activityTweens.forEach((tw) => tw && tw.remove && tw.remove());
                    animal.activityTweens = [];
                }
                if (animal.sprite.bearParts) {
                    animal.sprite.bearParts.legPivotL.angle = 0;
                    animal.sprite.bearParts.legPivotR.angle = 0;
                    animal.sprite.bearParts.bodyPivot.angle = 0;
                }
            });
        });
    }

    releaseAnimalFromMachine(machine) {
        this.animalUsers.forEach((animal) => {
            if (animal.usingMachineId !== machine.id) return;
            animal.usingMachineId = null;
            animal.cooldownUntil = this.time.now + Phaser.Math.Between(3000, 5000);
            if (animal.activityTweens?.length) {
                animal.activityTweens.forEach((tw) => tw && tw.remove && tw.remove());
                animal.activityTweens = [];
            }
            if (animal.currentTween) {
                animal.currentTween.stop();
                animal.currentTween = null;
            }
            this.tweens.killTweensOf(animal.sprite);
            animal.sprite.body.setVelocity(0, 0);
            if (animal.sprite.bearParts) {
                animal.sprite.bearParts.legPivotL.angle = 0;
                animal.sprite.bearParts.legPivotR.angle = 0;
                animal.sprite.bearParts.bodyPivot.angle = 0;
            }
            this.releaseMachine(machine, animal.name);
        });
    }

    tryUseNearestMachine() {
        if (this.playerLocked || this.machineUseActive) return;

        const nearbyMachines = this.machines
            .map((m) => ({
                m,
                d: Math.min(
                    Phaser.Math.Distance.Between(this.playerCroc.x, this.playerCroc.y, m.useSpotX, m.useSpotY),
                    Phaser.Math.Distance.Between(this.playerCroc.x, this.playerCroc.y, m.x, this.floorY - 85)
                )
            }))
            .filter((it) => it.d < 210)
            .sort((a, b) => a.d - b.d);

        if (!nearbyMachines.length) {
            this.statusText.setText("Move closer to a machine and press E");
            return;
        }

        let machine = nearbyMachines.find((entry) => this.time.now >= entry.m.occupiedUntil || !entry.m.occupiedBy)?.m;
        if (!machine) {
            machine = nearbyMachines[0].m;
            if (machine.occupiedBy && machine.occupiedBy !== "Crocodile") {
                this.releaseAnimalFromMachine(machine);
            }
        }

        const sessionId = ++this.machineSessionId;
        this.playerLocked = true;
        this.machineUseActive = true;
        this.activeMachine = machine;
        this.machineStartTime = this.time.now;
        this.clearMachineTimeouts();
        this.clearMachineFX();
        this.resetPlayerAfterMachine();
        this.playerCroc.body.setVelocityX(0);
        this.reserveMachine(machine, "Crocodile", machine.durationMs);
        this.statusText.setText(`Using ${machine.name}...`);

        this.tweens.add({
            targets: this.playerCroc,
            x: machine.useSpotX,
            y: machine.useSpotY,
            duration: 320,
            ease: "Quad.easeOut",
            onComplete: () => {
                try {
                    if (sessionId !== this.machineSessionId || this.activeMachine !== machine) return;

                    try {
                        this.startMachineFX(machine);
                    } catch (fxErr) {
                        console.error("Machine FX failed, continuing without FX:", fxErr);
                        this.clearMachineFX();
                    }

                    this.currentMachineTimeout = this.time.delayedCall(machine.durationMs, () => {
                        this.completeMachineUse(machine, sessionId);
                    });

                    this.currentMachineSafetyTimeout = this.time.delayedCall(machine.durationMs + 4500, () => {
                        if (this.machineUseActive && sessionId === this.machineSessionId) {
                            this.completeMachineUse(machine, sessionId);
                        }
                    });
                } catch (err) {
                    console.error("Machine start flow failed:", err);
                    this.completeMachineUse(machine, sessionId);
                }
            }
        });
    }
    

    completeMachineUse(machine, sessionId = this.machineSessionId) {
        try {
            console.log(`✅ Completing machine use: ${machine.name}`);

            if (!this.machineUseActive || sessionId !== this.machineSessionId || this.activeMachine !== machine) {
                console.log("⚠️ Machine completion ignored for stale session");
                return;
            }

            this.machineUseActive = false;
            this.playerLocked = false;
            this.clearMachineTimeouts();
            this.clearMachineFX();
            this.releaseMachine(machine, "Crocodile");
            this.activeMachine = null;

            this.resetPlayerAfterMachine();
            setCrocExpression(this.playerCroc, "happy");

            // Update stats
            this.reps += 1;
            if (machine.caloriesGain > 0) this.totalCalories += machine.caloriesGain;

            let effectText = `${machine.name} complete!`;
            if (machine.id === "bench") {
                STATE.energy = Math.max(20, STATE.energy - 7);
                STATE.mood = Math.min(100, STATE.mood + 5);
                STATE.stars += 2;
                effectText = "Bench press: Strength +2 stars, mood +5";
            } else if (machine.id === "cable") {
                STATE.energy = Math.max(20, STATE.energy - 6);
                STATE.mood = Math.min(100, STATE.mood + 4);
                STATE.coins += 8;
                effectText = "Cable row: Coins +8, posture boost";
            } else if (machine.id === "treadmill") {
                STATE.energy = Math.max(20, STATE.energy - 10);
                STATE.mood = Math.min(100, STATE.mood + 8);
                STATE.coins += 14;
                effectText = "Treadmill: Endurance up, coins +14";
            } else if (machine.id === "bike") {
                STATE.energy = Math.max(20, STATE.energy - 8);
                STATE.mood = Math.min(100, STATE.mood + 6);
                STATE.coins += 10;
                STATE.stars += 1;
                effectText = "Spin bike: Coins +10, stars +1";
            } else if (machine.id === "water") {
                STATE.energy = Math.min(100, STATE.energy + 14);
                STATE.mood = Math.min(100, STATE.mood + 3);
                effectText = "Hydration: Energy +14";
            } else if (machine.id === "sauna") {
                STATE.energy = Math.min(100, STATE.energy + 6);
                STATE.mood = Math.min(100, STATE.mood + 12);
                effectText = "Sauna: Mood +12, energy +6";
            } else if (machine.id === "stepper") {
                STATE.energy = Math.max(20, STATE.energy - 7);
                STATE.mood = Math.min(100, STATE.mood + 6);
                STATE.stars += 1;
                STATE.coins += 6;
                effectText = "Stepper: Stars +1, coins +6";
            }
            this.repText.setText(`Reps: ${this.reps}`);
            playSfx("coin", { volume: 0.3, rate: 1.0 });
            this.caloriesText.setText(`Calories: ${this.totalCalories}`);
            this.statusText.setText(`✓ ${effectText}`);
            this.playerSpeed = 240;
            addToast(this, effectText, "#fff5a0");

            this.tweens.add({
                targets: this.playerCroc,
                y: this.playerCroc.y - 18,
                duration: 200,
                yoyo: true,
                onComplete: () => {
                    if (sessionId !== this.machineSessionId) return;
                    this.playerCroc.y = this.floorY - 85;
                }
            });

            console.log("✅ Player fully unlocked and ready for next machine");
        } catch (err) {
            console.error("❌ Error in completeMachineUse:", err);
            this.forceUnlockPlayer("completeMachineUse error");
        }
    }

    update() {
        try {
            if (!this.playerLocked) {
                let vx = 0;
                if (this.keys.left.isDown || this.keys.arrowLeft.isDown || this.phoneControls.isDown("left")) vx -= this.playerSpeed;
                if (this.keys.right.isDown || this.keys.arrowRight.isDown || this.phoneControls.isDown("right")) vx += this.playerSpeed;
                this.playerCroc.body.setVelocityX(vx);
                this.playerCroc.y = this.floorY - 85;

                if (vx > 8) {
                    this.playerFacingDir = 1;
                    setCrocFacing(this.playerCroc, 1);
                    setCrocExpression(this.playerCroc, "neutral");
                } else if (vx < -8) {
                    this.playerFacingDir = -1;
                    setCrocFacing(this.playerCroc, -1);
                    setCrocExpression(this.playerCroc, "focused");
                }
            }

            if (Phaser.Input.Keyboard.JustDown(this.keys.q) || this.phoneControls.consume("q")) {
                this.playerFacingDir *= -1;
                setCrocFacing(this.playerCroc, this.playerFacingDir);
            }

            this.machines.forEach((m) => {
                const left = Math.max(0, m.occupiedUntil - this.time.now);
                const ratio = left > 0 ? 1 - Phaser.Math.Clamp(left / m.durationMs, 0, 1) : 0;
                m.barFill.width = 106 * ratio;
                m.barFill.setFillStyle(left > 0 ? 0xff8b8b : 0x67d6ff);
            });

            this.animalUsers.forEach((a) => {
                a.nameTag.x = a.sprite.x;
                a.nameTag.y = a.sprite.y + 76;
                a.barBg.x = a.sprite.x;
                a.barBg.y = a.sprite.y - 92;
                a.barFill.x = a.sprite.x - 44;
                a.barFill.y = a.sprite.y - 92;
                const left = Math.max(0, a.cooldownUntil - this.time.now);
                const ratio = 1 - Phaser.Math.Clamp(left / 9000, 0, 1);
                a.barFill.width = 88 * ratio;
                a.barFill.setFillStyle(a.usingMachineId ? 0xffc76b : 0x6de59d);
            });

            if ((Phaser.Input.Keyboard.JustDown(this.keys.e) || this.phoneControls.consume("e")) && !this.playerLocked && !this.machineUseActive) {
                this.tryUseNearestMachine();
            }
        } catch (err) {
            console.error("Error in workout update:", err);
        }
    }
}
*/
class KitchenScene extends Phaser.Scene {
    constructor() {
        super("KitchenScene");
    }

    create() {
        setSceneMusic("background");
        this.floorY = 620;
        this.kitchenLiteMode = true;
        this.playerBusy = false;
        this.selectedFood = null;
        this.cookedFood = null;
        this.cookingTween = null;
        this.foodPanelOpen = false;
        this.foodPanelObjects = [];
        this.heldFoodProp = null;
        this.cookedPot = null;
        this.kitchenItems = [];
        this.dirtPatches = [];
        this.sinkWashingOpen = false;
        this.sinkObjects = [];
        this.kitchenSinkDecor = [];
        this.dishesWashed = 0;

        this.add.rectangle(W / 2, H / 2, W, H, 0xfff2df);
        this.add.rectangle(W / 2, 190, W, 220, 0xffd8b0);
        this.add.rectangle(W / 2, this.floorY + 70, W, 210, 0xc6996d);
        this.add.rectangle(W / 2, this.floorY + 12, W, 18, 0x855634);

        // Fridge and cabinets.
        this.add.rectangle(160, 360, 220, 320, 0xdff2ff).setStrokeStyle(5, 0x7eb2d4);
        this.add.rectangle(160, 242, 190, 30, 0x6e9bbc).setStrokeStyle(2, 0xffffff);
        this.add.rectangle(160, 392, 8, 226, 0x8eb4c9);
        this.add.circle(118, 362, 8, 0xffffff).setStrokeStyle(2, 0x7399b1);
        this.add.circle(202, 362, 8, 0xffffff).setStrokeStyle(2, 0x7399b1);
        this.add.text(160, 242, "FRIDGE", { fontSize: "22px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5);

        // Oven + stove with real cookware.
        this.add.rectangle(625, 462, 250, 190, 0x474747).setStrokeStyle(4, 0xbababa);
        this.add.rectangle(625, 372, 220, 24, 0x2d2d2d).setStrokeStyle(2, 0x909090);
        for (let i = 0; i < 4; i++) {
            this.add.circle(560 + i * 44, 372, 12, 0x1a1a1a).setStrokeStyle(2, 0x5d5d5d);
        }
        this.add.rectangle(625, 445, 144, 84, 0x1b1b1b).setStrokeStyle(2, 0x9f9f9f);
        this.add.rectangle(625, 445, 114, 58, 0x2f4253, 0.85).setStrokeStyle(1, 0x8cb4cc);
        this.add.circle(625, 497, 7, 0x8f8f8f);

        // Medium frying pan and cooking pot on stove.
        this.add.ellipse(586, 360, 54, 18, 0x5e6168).setStrokeStyle(2, 0xbfc5ce);
        this.add.rectangle(549, 360, 42, 7, 0x42464f).setStrokeStyle(1, 0x9da4ae);
        this.add.ellipse(664, 360, 66, 26, 0x5a5f67).setStrokeStyle(2, 0xc4cad2);
        this.add.rectangle(664, 344, 34, 8, 0x7f858f).setStrokeStyle(1, 0xd6dbe2);
        this.add.rectangle(695, 360, 20, 6, 0x484d56);
        this.add.text(625, 372, "OVEN + STOVE", { fontSize: "18px", color: "#ffdf9a", fontStyle: "bold" }).setOrigin(0.5);

        // Kitchen table with ordered plates.
        this.add.rectangle(900, 580, 320, 88, 0xa06d45).setStrokeStyle(4, 0xffffff);
        this.add.rectangle(900, 536, 300, 14, 0x8a5e3b);
        this.add.ellipse(840, 574, 56, 22, 0xf5f7fa).setStrokeStyle(2, 0x9da9b8);
        this.add.ellipse(900, 574, 56, 22, 0xf5f7fa).setStrokeStyle(2, 0x9da9b8);
        this.add.ellipse(960, 574, 56, 22, 0xf5f7fa).setStrokeStyle(2, 0x9da9b8);
        this.add.rectangle(900, 602, 8, 38, 0x7a4e2f);

        // Dish shelf and ordered kitchen tools.
        this.add.rectangle(935, 280, 230, 16, 0x83553a).setStrokeStyle(2, 0xffffff, 0.5);
        for (let i = 0; i < (this.kitchenLiteMode ? 3 : 6); i++) {
            this.add.ellipse(858 + i * 30, 264, 24, 10, 0xf7f9fc).setStrokeStyle(1, 0x9aa9ba);
            this.add.rectangle(858 + i * 30, 246, 7, 16, 0xd4dde8).setStrokeStyle(1, 0x9aa9ba);
        }

        // === REAL SINK with window above it ===
        // Window frame above sink
        this.add.rectangle(1130, 230, 200, 160, 0xcfe8f7).setStrokeStyle(6, 0x8ab4cc).setDepth(2);
        this.add.rectangle(1130, 230, 200, 6, 0x8ab4cc).setDepth(3);      // horizontal divider
        this.add.rectangle(1130, 230, 6, 160, 0x8ab4cc).setDepth(3);      // vertical divider
        // Plain sky panel (sun/cloud removed per request)
        this.add.rectangle(1130, 230, 188, 148, 0x9dd6f8).setDepth(1);

        // Sink cabinet body
        this.add.rectangle(1130, 445, 300, 170, 0xdbeef8).setStrokeStyle(5, 0x8ab4cc).setDepth(5);
        // Sink basin (stainless steel look)
        this.add.rectangle(1130, 400, 240, 100, 0xc8dce8).setStrokeStyle(4, 0x7aaac0).setDepth(6);
        this.add.rectangle(1130, 400, 220, 80, 0xb8ccd8).setStrokeStyle(2, 0x6898b0).setDepth(7);
        // Drain hole
        this.add.circle(1130, 432, 10, 0x8090a0).setStrokeStyle(2, 0xffffff, 0.5).setDepth(8);
        this.add.circle(1130, 432, 6, 0x5a6875).setDepth(9);
        // Faucet arm
        this.add.rectangle(1130, 355, 14, 50, 0xd0d8e0).setStrokeStyle(2, 0x8098ac).setDepth(8);
        // Faucet head (curved)
        this.add.ellipse(1130, 328, 60, 16, 0xc8d4de).setStrokeStyle(2, 0x8098ac).setDepth(8);
        // Hot/cold knobs
        const sinkKnobHot = this.add.circle(1098, 340, 10, 0xff7070).setStrokeStyle(2, 0xffffff).setDepth(9);
        const sinkKnobCold = this.add.circle(1162, 340, 10, 0x70aaff).setStrokeStyle(2, 0xffffff).setDepth(9);
        // Soap dispenser
        const sinkSoapBottle = this.add.rectangle(1225, 378, 28, 52, 0x7ac4e8).setStrokeStyle(2, 0xffffff).setDepth(8);
        const sinkSoapNeck = this.add.rectangle(1225, 350, 14, 18, 0x5aaccd).setDepth(8);
        const sinkSoapCap = this.add.ellipse(1225, 342, 18, 10, 0x4a9abc).setDepth(8);
        // Sponge next to sink
        const sinkSponge = this.add.rectangle(1048, 418, 32, 20, 0xffe066).setStrokeStyle(2, 0xddb84a).setDepth(8);
        const sinkSpongeTop = this.add.rectangle(1048, 410, 28, 8, 0x6bdc7a).setStrokeStyle(1, 0x4ab55a).setDepth(9);
        // Dirty dishes in sink (shown when not washed)
        this.sinkDirtyDishes = this.add.container(1130, 405).setDepth(10);
        const dish1 = this.add.ellipse(-40, 8, 58, 20, 0xf0f4f8).setStrokeStyle(2, 0x9ab0c0);
        const dishFood1 = this.add.ellipse(-40, 8, 38, 12, 0xe8a060, 0.8);
        const dish2 = this.add.ellipse(10, 4, 50, 18, 0xf0f4f8).setStrokeStyle(2, 0x9ab0c0);
        const dishFood2 = this.add.ellipse(10, 4, 32, 10, 0x8cc870, 0.8);
        const cup = this.add.rectangle(52, 0, 20, 28, 0xe8f0f8).setStrokeStyle(2, 0x9abacc);
        const cupRim = this.add.ellipse(52, -13, 22, 8, 0xcadae8).setStrokeStyle(1, 0x8aacc0);
        this.sinkDirtyDishes.add([dish1, dishFood1, dish2, dishFood2, cup, cupRim]);
        this.add.text(1130, 340, "SINK", { fontSize: "18px", color: "#2d6d85", fontStyle: "bold", stroke: "#ffffff", strokeThickness: 2 }).setOrigin(0.5).setDepth(11);
        this.kitchenSinkDecor.push(
            sinkKnobHot,
            sinkKnobCold,
            sinkSoapBottle,
            sinkSoapNeck,
            sinkSoapCap,
            sinkSponge,
            sinkSpongeTop,
            this.sinkDirtyDishes
        );

        // === CLEANING TOOLS on right side wall ===
        // Mop
        this.add.rectangle(1235, 500, 10, 140, 0xa07040).setDepth(5);
        this.add.ellipse(1235, 440, 36, 20, 0xe8e8e8).setStrokeStyle(2, 0xbbbbbb).setDepth(6);
        for (let i = 0; i < (this.kitchenLiteMode ? 2 : 5); i++) {
            this.add.rectangle(1222 + i * 4, 450, 2, 18, 0xcccccc, 0.85).setDepth(7);
        }
        this.add.text(1235, 425, "MOP", { fontSize: "11px", color: "#886644", fontStyle: "bold" }).setOrigin(0.5).setDepth(8);

        // Bucket
        this.add.rectangle(1210, 590, 40, 36, 0x70b0d8).setStrokeStyle(2, 0x4a88b0).setDepth(6);
        this.add.ellipse(1210, 570, 40, 10, 0x90c8e8).setStrokeStyle(2, 0x4a88b0).setDepth(7);
        this.add.ellipse(1210, 606, 40, 10, 0x58a0c0).setDepth(6);
        // Water in bucket
        this.add.ellipse(1210, 590, 32, 16, 0xa8d8f0, 0.9).setDepth(8);

        // Broom
        this.add.rectangle(1258, 510, 8, 130, 0x9b7040).setDepth(5);
        this.add.polygon(1258, 445, [
            {x: -18, y: 0}, {x: 18, y: 0}, {x: 14, y: 20}, {x: -14, y: 20}
        ], 0xc08040).setDepth(6);
        for (let i = 0; i < (this.kitchenLiteMode ? 3 : 7); i++) {
            this.add.rectangle(1244 + i * 5, 460, 2, 14, 0xd8a860).setDepth(7);
        }
        this.add.text(1258, 430, "BROOM", { fontSize: "10px", color: "#886644", fontStyle: "bold" }).setOrigin(0.5).setDepth(8);

        // Spray bottle
        this.add.rectangle(1280, 550, 20, 40, 0x88cc88).setStrokeStyle(2, 0x558855).setDepth(6);
        this.add.rectangle(1280, 528, 10, 16, 0x66aa66).setDepth(6);
        this.add.rectangle(1270, 530, 18, 6, 0x558855).setDepth(7);
        this.add.text(1280, 575, "SPRAY", { fontSize: "10px", color: "#336633", fontStyle: "bold" }).setOrigin(0.5).setDepth(8);

        // === DIRT PATCHES that appear on floor ===
        this.dirtPatchGroup = this.add.container(0, 0).setDepth(4);
        // Spawn dirt just after scene paint to reduce click-to-open hitch.
        this.time.delayedCall(30, () => this.spawnDirtPatches());

        // Kitchen items on the floor for grounded realism.
        this.kitchenItems.push(this.add.rectangle(760, 608, 42, 30, 0x7b4f36).setStrokeStyle(2, 0xd7baa0));
        this.kitchenItems.push(this.add.ellipse(760, 595, 42, 14, 0xb17a58).setStrokeStyle(1, 0xecd7c4));
        this.kitchenItems.push(this.add.rectangle(980, 606, 28, 36, 0x8f6143).setStrokeStyle(2, 0xd7baa0));
        this.kitchenItems.push(this.add.rectangle(980, 588, 16, 8, 0xe6ecef).setStrokeStyle(1, 0xa8b8c5));

        this.add.text(W / 2, 52, "CHEF KITCHEN", {
            fontSize: "48px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#6f4428",
            strokeThickness: 5,
        }).setOrigin(0.5);

        this.player = drawCroc(this, 180, this.floorY - 74, 0.78).setDepth(20);
        this.physics.add.existing(this.player);
        this.player.body.setAllowGravity(false);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(185, 78, true);

        this.keys = this.input.keyboard.addKeys({
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            e: Phaser.Input.Keyboard.KeyCodes.E,
            arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
            arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        });
        this.phoneControls = createPhoneControls(this, { e: true });

        this.statusText = this.add.text(24, 150, "Choose food from the fridge, cook it, then eat.", {
            fontSize: "22px", color: "#6c4628", fontStyle: "bold"
        }).setScrollFactor(0);
        this.effectText = this.add.text(24, 185, "", {
            fontSize: "20px", color: "#3f6c35", fontStyle: "bold"
        }).setScrollFactor(0);

        this.foodText = this.add.text(24, 88, "Selected: none | Cooked: none", {
            fontSize: "19px", color: "#5a3c24", fontStyle: "bold"
        }).setScrollFactor(0);

        this.foodOptions = [
            { name: "Salad", icon: "SAL", energy: 8, mood: 5, color: 0x6ccf77 },
            { name: "Fish", icon: "FSH", energy: 14, mood: 4, color: 0x4db5e5 },
            { name: "Soup", icon: "SUP", energy: 10, mood: 7, color: 0xe2a861 },
            { name: "Pasta", icon: "PAS", energy: 12, mood: 8, color: 0xf0c86b },
            { name: "Steak", icon: "STK", energy: 16, mood: 6, color: 0xbd5a53 },
            { name: "Cake", icon: "CAK", energy: 7, mood: 12, color: 0xf09cb7 },
        ];

        this.stations = [
            { id: "fridge", x: 160, prompt: "Open fridge and choose food", cooldownUntil: 0 },
            { id: "oven", x: 625, prompt: "Cook selected food in oven", cooldownUntil: 0 },
            { id: "table", x: 900, prompt: "Eat cooked meal", cooldownUntil: 0 },
            { id: "broom", x: 1258, prompt: "Sweep and clean dirty floor", cooldownUntil: 0 },
            { id: "sink", x: 1130, prompt: "Wash dirty dishes in sink", cooldownUntil: 0 },
        ];

        this.promptText = this.add.text(W / 2, H - 34, "Move near a station and press E", {
            fontSize: "20px", color: "#ffffff", fontStyle: "bold", stroke: "#7b4a28", strokeThickness: 3
        }).setOrigin(0.5);

        this.updateHeldFoodVisual();

        uiButton(this, W - 100, 44, 170, 52, "HOME", () => this.scene.start("HubScene"), 0xff7d7d, 0xff5858);
    }

    spawnDirtPatches() {
        // Clear old dirt
        this.dirtPatchGroup.removeAll(true);
        this.dirtPatches = [];
        const positions = this.kitchenLiteMode
            ? [520, 760, 980, 1120]
            : [480, 560, 750, 820, 960, 1040];
        positions.forEach(x => {
            const patch = this.add.ellipse(x, this.floorY + 6, Phaser.Math.Between(36, 60), 16,
                Phaser.Utils.Array.GetRandom([0xb0804a, 0xa07038, 0x8a6030]), 0.85
            ).setDepth(3);
            this.dirtPatches.push(patch);
            this.dirtPatchGroup.add(patch);
        });
    }

    createFoodProp(food) {
        const prop = this.add.container(this.player.x + 96, this.player.y - 18).setDepth(42);
        const plate = this.add.ellipse(0, 12, 50, 16, 0xf3f6fb).setStrokeStyle(2, 0xa1b4c6);
        const meal = this.add.ellipse(0, 4, 34, 20, food.color || 0x7db4e8).setStrokeStyle(2, 0xffffff, 0.65);
        const tag = this.add.text(0, 3, food.icon || "FOOD", {
            fontSize: "12px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#1f2b35",
            strokeThickness: 3,
        }).setOrigin(0.5);
        prop.add([plate, meal, tag]);
        return prop;
    }

    updateHeldFoodVisual() {
        if (this.heldFoodProp) {
            this.heldFoodProp.destroy();
            this.heldFoodProp = null;
        }

        const shown = this.cookedFood || this.selectedFood;
        if (!shown) return;
        this.heldFoodProp = this.createFoodProp(shown);
    }

    closeFoodPanel() {
        this.foodPanelObjects.forEach((obj) => obj.destroy());
        this.foodPanelObjects = [];
        this.foodPanelOpen = false;
        this.statusText.setVisible(true);
        this.effectText.setVisible(true);
        this.foodText.setVisible(true);
        this.promptText.setVisible(true);
        this.kitchenSinkDecor.forEach((obj) => {
            if (obj && obj.setVisible) obj.setVisible(true);
        });
    }

    openFoodPanel() {
        if (this.sinkWashingOpen || this.sinkObjects.length) {
            this.closeSinkWashing();
        }
        this.closeFoodPanel();
        playSfx("fridge", { volume: 0.35, rate: 1.0 });
        this.foodPanelOpen = true;
        this.statusText.setVisible(false);
        this.effectText.setVisible(false);
        this.foodText.setVisible(false);
        this.promptText.setVisible(false);
        this.kitchenSinkDecor.forEach((obj) => {
            if (obj && obj.setVisible) obj.setVisible(false);
        });

        const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.45).setDepth(120);
        const panel = this.add.rectangle(W / 2, H / 2, 760, 430, 0xffffff, 0.97).setStrokeStyle(8, 0x6ea0c2).setDepth(121);
        const title = this.add.text(W / 2, 196, "FRIDGE MENU", {
            fontSize: "44px", color: "#245173", fontStyle: "bold", stroke: "#ffffff", strokeThickness: 4
        }).setOrigin(0.5).setDepth(122);

        this.foodPanelObjects.push(overlay, panel, title);

        // Show purchased items from supermarket first (if any)
        const shopItems = STATE.fridgeItems.slice(-8); // most recent 8 shop items
        const allFoodOptions = [
            ...shopItems.map(si => ({
                name: si.name,
                icon: si.name.substring(0, 3).toUpperCase(),
                energy: 10, mood: 5,
                color: si.section === "Produce" ? 0x6ccf77 : si.section === "Dairy" ? 0xa8d8f0 : si.section === "Frozen" ? 0x88ccee : 0xf0c86b,
                fromShop: true
            })),
            ...this.foodOptions,
        ].slice(0, 9);

        allFoodOptions.forEach((food, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const x = 390 + col * 250;
            const y = 288 + row * 116;
            const btn = uiButton(this, x, y, 220, 82, `${food.name}`, () => {
                this.selectedFood = food;
                this.foodText.setText(`Selected: ${food.name} | Cooked: ${this.cookedFood ? this.cookedFood.name : "none"}`);
                this.effectText.setText(`${food.name} selected. Go to the oven.`);
                addToast(this, `Selected ${food.name}`, "#dff8ff");
                // If from shop, remove it from fridgeItems
                if (food.fromShop) {
                    const idx = STATE.fridgeItems.findIndex(fi => fi.name === food.name);
                    if (idx !== -1) STATE.fridgeItems.splice(idx, 1);
                }
                this.closeFoodPanel();
                this.updateHeldFoodVisual();
            }, 0x8ac5e6, 0x69afd5);
            btn.btn.setDepth(122);
            btn.label.setDepth(123).setFontSize("24px");
            this.foodPanelObjects.push(btn.btn, btn.label);
        });

        const close = uiButton(this, W / 2, 520, 220, 70, "CLOSE", () => this.closeFoodPanel(), 0xff9a9a, 0xff6f6f);
        close.btn.setDepth(122);
        close.label.setDepth(123).setFontSize("26px");
        this.foodPanelObjects.push(close.btn, close.label);
    }

    // === REAL SINK WASHING mini-scene ===
    openSinkWashing() {
        if (this.sinkWashingOpen) return;
        playSfx("tap", { volume: 0.28, rate: 1.0, durationMs: 1000, instanceKey: "kitchen-tap", replaceExisting: true });
        this.sinkWashingOpen = true;
        this.playerBusy = true;
        this.statusText.setVisible(false);
        this.effectText.setVisible(false);
        this.foodText.setVisible(false);
        this.promptText.setVisible(false);

        const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setDepth(130);
        const panel = this.add.rectangle(W / 2, H / 2, 760, 520, 0xdff0fc, 0.98).setStrokeStyle(8, 0x5a9ebf).setDepth(131);

        // Window in panel (croc faces this)
        const winFrame = this.add.rectangle(W / 2, 180, 200, 140, 0xa8d8f0).setStrokeStyle(5, 0x6090b0).setDepth(132);
        this.add.rectangle(W / 2, 180, 200, 4, 0x6090b0).setDepth(133);
        this.add.rectangle(W / 2, 180, 4, 140, 0x6090b0).setDepth(133);
        const winTitle = this.add.text(W / 2, 180, "WATER AREA", { fontSize: "18px", color: "#2f6f8f", fontStyle: "bold" }).setOrigin(0.5).setDepth(134);

        // Sink basin in panel
        const basin = this.add.rectangle(W / 2, 370, 340, 160, 0xbbd8e8).setStrokeStyle(4, 0x7aaac0).setDepth(132);
        const sinkInner = this.add.rectangle(W / 2, 380, 300, 120, 0x9fc8e0).setStrokeStyle(2, 0x6898b0).setDepth(133);
        const drain = this.add.circle(W / 2, 430, 12, 0x607888).setStrokeStyle(2, 0xffffff, 0.5).setDepth(134);

        // Faucet
        const faucetArm = this.add.rectangle(W / 2, 285, 12, 60, 0xd0d8e0).setStrokeStyle(2, 0x8098ac).setDepth(133);
        const faucetHead = this.add.ellipse(W / 2, 252, 70, 18, 0xc8d4de).setStrokeStyle(2, 0x8098ac).setDepth(133);
        const knobHot = this.add.circle(W / 2 - 42, 268, 11, 0xff8080).setStrokeStyle(2, 0xffffff).setDepth(134);
        const knobCold = this.add.circle(W / 2 + 42, 268, 11, 0x80aaff).setStrokeStyle(2, 0xffffff).setDepth(134);

        // Title
        const titleTxt = this.add.text(W / 2, 120, "DISH WASHING", {
            fontSize: "38px", color: "#1a5a78", fontStyle: "bold", stroke: "#ffffff", strokeThickness: 4
        }).setOrigin(0.5).setDepth(132);

        // Dishes to wash
        const dishQueue = [
            { color: 0xf0f4f8, foodColor: 0xe8a060, label: "Plate" },
            { color: 0xf8f0f0, foodColor: 0x8cc870, label: "Bowl" },
            { color: 0xe8f0f8, foodColor: 0xf0c060, label: "Cup" },
        ];
        this.dishesWashed = 0;
        this.currentDishIdx = 0;

        const dishStatusTxt = this.add.text(W / 2, 502, `Dishes: ${this.dishesWashed}/${dishQueue.length} washed`, {
            fontSize: "22px", color: "#1a5a78", fontStyle: "bold"
        }).setOrigin(0.5).setDepth(135);

        // Current dish visual in sink
        let currentDishObj = null;
        const drawCurrentDish = () => {
            if (currentDishObj) currentDishObj.destroy();
            if (this.currentDishIdx >= dishQueue.length) {
                currentDishObj = null;
                return;
            }
            const d = dishQueue[this.currentDishIdx];
            currentDishObj = this.add.container(W / 2, 375).setDepth(136);
            const dishShape = this.add.ellipse(0, 0, 80, 28, d.color).setStrokeStyle(3, 0x9ab0c0);
            const dishFood = this.add.ellipse(0, -2, 52, 16, d.foodColor, 0.7);
            const dlabel = this.add.text(0, -1, d.label, { fontSize: "12px", color: "#445566", fontStyle: "bold" }).setOrigin(0.5);
            currentDishObj.add([dishShape, dishFood, dlabel]);
            this.sinkObjects.push(currentDishObj);
        };
        drawCurrentDish();

        // Soap bottle & scrub brush in panel
        const panelSoapBody = this.add.rectangle(W / 2 + 180, 360, 28, 56, 0x7ac4e8).setStrokeStyle(2, 0x4a88b0).setDepth(133);
        const panelSoapNeck = this.add.rectangle(W / 2 + 180, 330, 14, 20, 0x5aaccd).setDepth(133);
        const panelSoapTxt = this.add.text(W / 2 + 180, 392, "SOAP", { fontSize: "11px", color: "#1a5a78", fontStyle: "bold" }).setOrigin(0.5).setDepth(135);
        const panelSponge = this.add.rectangle(W / 2 - 170, 374, 36, 20, 0xffe066).setStrokeStyle(2, 0xd8a840).setDepth(133);
        const panelSpongeTop = this.add.rectangle(W / 2 - 170, 358, 32, 10, 0x7ad07a).setDepth(134);
        const panelSpongeTxt = this.add.text(W / 2 - 170, 392, "SPONGE", { fontSize: "10px", color: "#336633", fontStyle: "bold" }).setOrigin(0.5).setDepth(135);

        // Water stream visual (animated)
        this.waterStreamActive = false;
        const waterStream = this.add.container(W / 2, 268).setDepth(137).setAlpha(0);
        const drops = [];
        for (let i = 0; i < 6; i++) {
            const d = this.add.rectangle(i * 4 - 10, 0, 3, 16 + i * 3, 0x78d7ff, 0.85);
            drops.push(d);
            waterStream.add(d);
        }
        this.sinkObjects.push(waterStream);

        // Wash button
        const washBtn = this.add.rectangle(W / 2 - 100, 554, 180, 62, 0x5abce8)
            .setStrokeStyle(4, 0xffffff).setDepth(136).setInteractive({ useHandCursor: true });
        const washBtnTxt = this.add.text(W / 2 - 100, 554, "WASH DISH", {
            fontSize: "20px", color: "#ffffff", fontStyle: "bold"
        }).setOrigin(0.5).setDepth(137);
        washBtn.on("pointerdown", () => {
            if (this.currentDishIdx >= dishQueue.length) return;
            playSfx("tap", { volume: 0.24, rate: 1.08, durationMs: 1000, instanceKey: "kitchen-tap", replaceExisting: true });
            const brushSponge = this.add.rectangle(W / 2 - 170, 374, 36, 20, 0xffe066).setStrokeStyle(2, 0xd8a840).setDepth(139);
            const brushSoap = this.add.rectangle(W / 2 + 180, 360, 28, 56, 0x7ac4e8).setStrokeStyle(2, 0xffffff).setDepth(139);
            this.sinkObjects.push(brushSponge, brushSoap);
            // Turn on water
            waterStream.setAlpha(1);
            this.waterStreamActive = true;
            this.tweens.add({
                targets: drops,
                y: 120,
                duration: 400,
                delay: (_, i) => i * 40,
                onComplete: () => drops.forEach(d => d.y = 0)
            });
            // Animate scrubbing the dish
            if (currentDishObj) {
                this.tweens.add({
                    targets: currentDishObj,
                    x: W / 2 + 12,
                    duration: 250,
                    yoyo: true,
                    repeat: 3,
                });
                this.tweens.add({
                    targets: brushSponge,
                    x: W / 2 - 16,
                    y: 368,
                    duration: 280,
                    yoyo: true,
                    repeat: 2,
                });
                this.tweens.add({
                    targets: brushSoap,
                    x: W / 2 + 40,
                    y: 350,
                    duration: 340,
                    yoyo: true,
                    repeat: 1,
                });
            }
            // Soap bubbles
            for (let b = 0; b < 10; b++) {
                const bub = this.add.circle(
                    W / 2 + Phaser.Math.Between(-80, 80),
                    350 + Phaser.Math.Between(-20, 20),
                    Phaser.Math.Between(5, 12), 0xffffff, 0.75
                ).setStrokeStyle(1, 0xaadaee).setDepth(138);
                this.sinkObjects.push(bub);
                this.tweens.add({ targets: bub, y: bub.y - 60, alpha: 0, duration: 900, delay: b * 80, onComplete: () => bub.destroy() });
            }
            this.time.delayedCall(900, () => {
                waterStream.setAlpha(0);
                if (brushSponge.active) brushSponge.destroy();
                if (brushSoap.active) brushSoap.destroy();
                this.currentDishIdx++;
                this.dishesWashed++;
                dishStatusTxt.setText(`Dishes: ${this.dishesWashed}/${dishQueue.length} washed`);
                drawCurrentDish();
                if (this.dishesWashed >= dishQueue.length) {
                    washBtn.disableInteractive();
                    washBtnTxt.setText("ALL DONE!");
                    // Remove dirty dishes from sink display
                    this.sinkDirtyDishes.setAlpha(0);
                    addToast(this, "All dishes washed clean!", "#d4f8ff");
                }
            });
        });

        // Close button
        const closeBtn = uiButton(this, W / 2 + 120, 554, 160, 62, "DONE", () => {
            this.closeSinkWashing();
            if (this.dishesWashed > 0) {
                STATE.stars += this.dishesWashed;
                STATE.mood = Math.min(100, STATE.mood + 6);
                this.effectText.setText(`Washed ${this.dishesWashed} dishes: stars +${this.dishesWashed}, mood +6`);
            }
            addToast(this, "Sink area clean!", "#d4f8ff");
            this.playerBusy = false;
        }, 0x5abce8, 0x3a9fc8);
        closeBtn.btn.setDepth(136);
        closeBtn.label.setDepth(137);

        this.sinkObjects.push(overlay, panel, winFrame, winTitle, basin, sinkInner, drain,
            faucetArm, faucetHead, knobHot, knobCold, titleTxt, dishStatusTxt, washBtn, washBtnTxt,
            closeBtn.btn, closeBtn.label, panelSoapBody, panelSoapNeck, panelSoapTxt, panelSponge, panelSpongeTop, panelSpongeTxt);
    }

    closeSinkWashing() {
        this.sinkObjects.forEach(o => { if (o && o.destroy) o.destroy(); });
        this.sinkObjects = [];
        this.sinkWashingOpen = false;
        this.statusText.setVisible(true);
        this.effectText.setVisible(true);
        this.foodText.setVisible(true);
        this.promptText.setVisible(true);
        this.kitchenSinkDecor.forEach((obj) => {
            if (obj && obj.setVisible) obj.setVisible(true);
        });
    }

    useStation(station) {
        if (this.playerBusy || this.time.now < station.cooldownUntil) return;

        if (station.id === "fridge") {
            this.openFoodPanel();
            this.statusText.setText("Pick food from the fridge menu.");
            return;
        }

        if (station.id === "sink") {
            this.openSinkWashing();
            this.statusText.setText("Wash the dirty dishes in the sink.");
            return;
        }

        if (station.id === "broom") {
            // Sweep dirt patches animation
            if (this.dirtPatches.length === 0) {
                addToast(this, "Kitchen floor is already clean!", "#d4f8ff");
                return;
            }
            this.playerBusy = true;
            station.cooldownUntil = this.time.now + 3000;
            // Animate croc sweeping back and forth
            const startX = this.player.x;
            let step = 0;
            const sweepPositions = [480, 560, 750, 820, 960, 1040];
            const sweepNext = () => {
                if (step >= sweepPositions.length) {
                    // All clean
                    this.dirtPatches.forEach(p => p.destroy());
                    this.dirtPatches = [];
                    STATE.stars += 1;
                    STATE.mood = Math.min(100, STATE.mood + 6);
                    this.effectText.setText("Floor swept clean! Stars +1, mood +6");
                    addToast(this, "Kitchen cleaned!", "#d4f8ff");
                    // Respawn dirt after delay
                    this.time.delayedCall(18000, () => this.spawnDirtPatches());
                    this.tweens.add({ targets: this.player, x: startX, duration: 400, onComplete: () => { this.playerBusy = false; } });
                    return;
                }
                const tx = sweepPositions[step];
                this.tweens.add({
                    targets: this.player,
                    x: tx,
                    duration: 280,
                    onComplete: () => {
                        // Remove dirt patch near this position
                        const idx = this.dirtPatches.findIndex(p => Math.abs(p.x - tx) < 80);
                        if (idx !== -1) {
                            const patch = this.dirtPatches[idx];
                            // Dust puff
                            for (let i = 0; i < 5; i++) {
                                const puff = this.add.circle(patch.x + Phaser.Math.Between(-20, 20), patch.y - 10,
                                    Phaser.Math.Between(6, 12), 0xc8a880, 0.7).setDepth(6);
                                this.tweens.add({ targets: puff, y: puff.y - 30, alpha: 0, duration: 500, delay: i * 60, onComplete: () => puff.destroy() });
                            }
                            patch.destroy();
                            this.dirtPatches.splice(idx, 1);
                        }
                        step++;
                        sweepNext();
                    }
                });
            };
            setCrocExpression(this.player, "focused");
            sweepNext();
            return;
        }

        this.playerBusy = true;
        station.cooldownUntil = this.time.now + 1800;
        this.player.body.setVelocityX(0);

        this.tweens.add({
            targets: this.player,
            x: station.x - 36,
            duration: 260,
            ease: "Quad.easeOut",
            onComplete: () => {
                let effect = "";

                if (station.id === "oven") {
                    if (!this.selectedFood) {
                        effect = "Choose food from fridge first.";
                    } else {
                        playSfx("boil", { volume: 0.34, rate: 1.0, durationMs: 1800, instanceKey: "kitchen-boil", replaceExisting: true });
                        if (this.cookedPot) this.cookedPot.destroy();
                        this.cookedPot = this.add.container(station.x + 6, 358).setDepth(41);
                        const potBody = this.add.ellipse(0, 12, 72, 28, 0x59616b).setStrokeStyle(2, 0xd3d9e2);
                        const potLid = this.add.ellipse(0, 0, 64, 14, 0x7f8792).setStrokeStyle(2, 0xe2e8ef);
                        const potKnob = this.add.circle(0, -8, 6, 0xd9dfe8).setStrokeStyle(1, 0x6a7482);
                        const steam1 = this.add.rectangle(-16, -18, 4, 18, 0xeaf4ff, 0.75);
                        const steam2 = this.add.rectangle(0, -22, 4, 18, 0xeaf4ff, 0.75);
                        const steam3 = this.add.rectangle(16, -18, 4, 18, 0xeaf4ff, 0.75);
                        this.cookedPot.add([potBody, potLid, potKnob, steam1, steam2, steam3]);

                        this.tweens.add({ targets: this.cookedPot, y: 350, duration: 220, yoyo: true, repeat: 5 });
                        this.tweens.add({ targets: [steam1, steam2, steam3], y: "-=14", alpha: 0.1, duration: 520, yoyo: true, repeat: 4 });
                        this.cookedFood = this.selectedFood;
                        this.updateHeldFoodVisual();
                        effect = `${this.cookedFood.name} cooked perfectly.`;
                    }
                } else if (station.id === "table") {
                    if (!this.cookedFood) {
                        effect = "Cook food in oven before eating.";
                    } else {
                        const meal = this.createFoodProp(this.cookedFood);
                        meal.x = station.x;
                        meal.y = 530;
                        this.tweens.add({ targets: meal, alpha: 0, y: 470, duration: 950, onComplete: () => meal.destroy() });
                        STATE.energy = Math.min(100, STATE.energy + this.cookedFood.energy);
                        STATE.mood = Math.min(100, STATE.mood + this.cookedFood.mood);
                        STATE.coins += 4;
                        effect = `Meal eaten: energy +${this.cookedFood.energy}, mood +${this.cookedFood.mood}`;
                        this.selectedFood = null;
                        this.cookedFood = null;
                        this.updateHeldFoodVisual();
                        // After eating, dirty dishes appear again
                        this.sinkDirtyDishes.setAlpha(1);
                        this.tweens.add({
                            targets: this.player,
                            scaleY: 0.85,
                            duration: 140,
                            yoyo: true,
                            repeat: 2,
                        });
                    }
                }

                this.foodText.setText(`Selected: ${this.selectedFood ? this.selectedFood.name : "none"} | Cooked: ${this.cookedFood ? this.cookedFood.name : "none"}`);
                this.effectText.setText(effect);
                setCrocExpression(this.player, "happy");
                addToast(this, effect, "#fff6c5");
                this.time.delayedCall(900, () => {
                    this.playerBusy = false;
                    setCrocExpression(this.player, "neutral");
                });
            }
        });
    }

    update() {
        if (this.heldFoodProp) {
            const facing = this.player.scaleX >= 0 ? 1 : -1;
            this.heldFoodProp.x = this.player.x + (88 * facing);
            this.heldFoodProp.y = this.player.y - 16;
            this.heldFoodProp.scaleX = facing;
        }

       // Find nearest station without sorting (saves memory)
        let nearest = null;
        let minDistance = Infinity;
        for (let station of this.stations) {
            let dist = Math.abs(this.player.x - station.x);
            if (dist < minDistance) {
                minDistance = dist;
                nearest = station;
            }
        }
        const nearEnough = nearest && minDistance < 135;
        this.promptText.setText(nearEnough ? `Press E: ${nearest.prompt}` : "Move near a station and press E");

        if (!this.playerBusy && !this.foodPanelOpen && !this.sinkWashingOpen) {
            let vx = 0;
            if (this.keys.left.isDown || this.keys.arrowLeft.isDown || this.phoneControls.isDown("left")) vx -= 220;
            if (this.keys.right.isDown || this.keys.arrowRight.isDown || this.phoneControls.isDown("right")) vx += 220;
            this.player.body.setVelocityX(vx);
            this.player.y = this.floorY - 74;
            if (vx > 8) {
                setCrocFacing(this.player, 1);
                setCrocExpression(this.player, "neutral");
            } else if (vx < -8) {
                setCrocFacing(this.player, -1);
                setCrocExpression(this.player, "focused");
            }
        } else {
            this.player.body.setVelocityX(0);
        }

        if ((Phaser.Input.Keyboard.JustDown(this.keys.e) || this.phoneControls.consume("e")) && nearEnough && !this.sinkWashingOpen && !this.foodPanelOpen) {
            this.useStation(nearest);
        }
    }
}

class BedroomScene extends Phaser.Scene {
    constructor() {
        super("BedroomScene");
    }

    create() {
        setSceneMusic("background");
        this.floorY = 620;
        this.playerBusy = false;
        this.sleeping = false;
        this.wardrobeOpen = false;
        this.wardrobeObjects = [];
        this.sleepBlanket = null;
        this.hatGraphic = null;
        this.glassesGraphic = null;

        this.add.rectangle(W / 2, H / 2, W, H, 0xefe8ff);
        this.add.rectangle(W / 2, 190, W, 220, 0xd8cbff);
        this.add.rectangle(W / 2, this.floorY + 70, W, 210, 0xa98870);
        this.add.rectangle(W / 2, this.floorY + 12, W, 18, 0x7e624e);

        // Real floor bed with base, mattress, pillow, and blanket.
        this.add.rectangle(240, 560, 340, 30, 0x6f4c3e).setStrokeStyle(3, 0x4e342e);
        this.add.rectangle(240, 530, 320, 54, 0xfff6ef).setStrokeStyle(3, 0xd8b8a5);
        this.add.rectangle(306, 520, 92, 24, 0xffffff).setStrokeStyle(2, 0xc7d3e2);
        this.add.rectangle(206, 542, 186, 34, 0xf7b1d2, 0.95).setStrokeStyle(2, 0xffffff);

        this.add.rectangle(660, 420, 220, 270, 0xffffff).setStrokeStyle(4, 0xc8a7ff);
        this.add.rectangle(660, 278, 190, 34, 0x9c7ee0).setStrokeStyle(2, 0xffffff);
        this.add.text(860, 500, "WARDROBE", { fontSize: "20px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5);

        // Study area with desk, monitor, chair centered at desk, and coffee cup.
        this.add.rectangle(930, 500, 280, 30, 0x6c4e35).setStrokeStyle(4, 0xffffff);
        this.add.rectangle(840, 548, 22, 62, 0x5b402c);
        this.add.rectangle(1020, 548, 22, 62, 0x5b402c);
        this.add.rectangle(930, 448, 116, 70, 0x2a2f38).setStrokeStyle(3, 0x9faab8);
        this.add.rectangle(930, 450, 96, 52, 0x5f8cad).setStrokeStyle(2, 0xb9d3e6);
        this.add.rectangle(930, 486, 42, 10, 0x656d78);
        this.add.rectangle(860, 478, 68, 20, 0x2a2f38).setStrokeStyle(2, 0x8a96a5);
        this.add.rectangle(860, 458, 18, 18, 0x7d4e2f).setStrokeStyle(1, 0xe5d0bf);
        this.add.ellipse(860, 449, 20, 8, 0xe3ecef).setStrokeStyle(1, 0x9ab0bb);
        // Chair centered at desk (x:930)
        this.add.rectangle(930, 520, 68, 78, 0x3d4655).setStrokeStyle(3, 0xa7b6c8);
        this.add.rectangle(930, 478, 76, 40, 0x4e596b).setStrokeStyle(3, 0xa7b6c8);
        this.add.rectangle(912, 572, 10, 70, 0x32404f).setStrokeStyle(1, 0x8ea2b8);
        this.add.rectangle(948, 572, 10, 70, 0x32404f).setStrokeStyle(1, 0x8ea2b8);
        this.add.rectangle(930, 604, 74, 8, 0x2c3946).setStrokeStyle(1, 0x7f92a6);
        this.add.ellipse(912, 606, 18, 8, 0x1f2933);
        this.add.ellipse(948, 606, 18, 8, 0x1f2933);
        this.add.text(930, 410, "STUDY DESK", { fontSize: "20px", color: "#0b19db", fontStyle: "bold" }).setOrigin(0.5);

        // Move bedroom title away from center to keep scene cleaner.
        this.add.rectangle(210, 74, 360, 84, 0x5f4aa2, 0.55).setStrokeStyle(3, 0xffffff, 0.7);
        this.add.text(210, 56, "BEDROOM RETREAT", {
            fontSize: "36px", color: "#ffffff", fontStyle: "bold", stroke: "#3e2e76", strokeThickness: 5
        }).setOrigin(0.5);

        this.player = drawCroc(this, 180, this.floorY - 74, 0.78).setDepth(20);
        this.physics.add.existing(this.player);
        this.player.body.setAllowGravity(false);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(185, 78, true);

        this.keys = this.input.keyboard.addKeys({
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            e: Phaser.Input.Keyboard.KeyCodes.E,
            arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
            arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        });
        this.phoneControls = createPhoneControls(this, { e: true });

        this.statusText = this.add.text(100, 150, "Sleep deeply, customize style, and level up mood.", {
            fontSize: "22px", color: "#5c4199", fontStyle: "bold"
        }).setScrollFactor(0);
        this.effectText = this.add.text(24, 150, "", {
            fontSize: "20px", color: "#476348", fontStyle: "bold"
        }).setScrollFactor(0);

        this.styleText = this.add.text(100, 120, "Style: Casual | Hat: None | Glasses: None", {
            fontSize: "19px", color: "#553c8f", fontStyle: "bold"
        }).setScrollFactor(0);

        this.outfitStyles = ["Trousers", "Suit", "Jacket", "Explorer", "Royal", "Chef", "Traveler", "Student"];
        this.hatStyles = ["None", "Cap", "Beanie", "Crown", "Top", "Bucket", "Fedora", "Helmet"];
        this.glassesStyles = ["None", "Classic", "Sun", "Round", "Goggles", "Square", "Aviator", "Sport"];
        this.palette = [0x67d681, 0x6fb2ff, 0xff7ea1, 0xffcc69, 0xb98bff];

        this.styleIndex = STATE.outfit?.styleIndex ?? 0;
        this.hatIndex = STATE.outfit?.hatIndex ?? 0;
        this.glassIndex = STATE.outfit?.glassIndex ?? 0;
        this.colorIndex = STATE.outfit?.colorIndex ?? 0;

        this.styleSprites = {
            top: this.add.rectangle(this.player.x + 10, this.player.y + 10, 130, 75, this.palette[this.colorIndex]).setDepth(25).setStrokeStyle(2, 0xffffff),
            jacketL: this.add.rectangle(this.player.x - 26, this.player.y + 10, 38, 56, 0x2f3c57).setDepth(26).setStrokeStyle(1, 0xffffff, 0.4),
            jacketR: this.add.rectangle(this.player.x + 46, this.player.y + 10, 38, 56, 0x2f3c57).setDepth(26).setStrokeStyle(1, 0xffffff, 0.4),
            trousersL: this.add.rectangle(this.player.x - 6, this.player.y + 44, 34, 44, 0x2f4050).setDepth(24).setStrokeStyle(1, 0xffffff, 0.35),
            trousersR: this.add.rectangle(this.player.x + 28, this.player.y + 44, 34, 44, 0x2f4050).setDepth(24).setStrokeStyle(1, 0xffffff, 0.35),
            belt: this.add.rectangle(this.player.x + 20, this.player.y + 27, 80, 8, 0x2a2a2a).setDepth(27),
        };

        this.stations = [
            { id: "bed", x: 240, prompt: "Sleep in the floor bed", cooldownUntil: 0 },
            { id: "closet", x: 660, prompt: "Open wardrobe and choose style", cooldownUntil: 0 },
            { id: "desk", x: 930, prompt: "Study notes in bedroom", cooldownUntil: 0 },
        ];

        this.promptText = this.add.text(W / 2, H - 34, "Move near a bedroom station and press E", {
            fontSize: "20px", color: "#ffffff", fontStyle: "bold", stroke: "#6848b9", strokeThickness: 3
        }).setOrigin(0.5);

        uiButton(this, W - 100, 44, 170, 52, "HOME", () => this.scene.start("HubScene"), 0xff7d7d, 0xff5858);
        this.refreshStyleText();
        this.applyStyleVisuals();
    }

    refreshStyleText() {
        this.styleText.setText(`Style: ${this.outfitStyles[this.styleIndex]} | Hat: ${this.hatStyles[this.hatIndex]} | Glasses: ${this.glassesStyles[this.glassIndex]}`);
    }

    applyStyleVisuals() {
        const outfit = this.outfitStyles[this.styleIndex];
        const color = this.palette[this.colorIndex];
        this.styleSprites.top.setFillStyle(color);

        // Outfit presets for realistic clothing variety.
        if (outfit === "Trousers") {
            this.styleSprites.jacketL.setFillStyle(color);
            this.styleSprites.jacketR.setFillStyle(color);
            this.styleSprites.trousersL.setFillStyle(0x2f4050);
            this.styleSprites.trousersR.setFillStyle(0x2f4050);
            this.styleSprites.belt.setFillStyle(0x1f1f1f).setVisible(true);
            this.styleSprites.top.setSize(126, 56);
        } else if (outfit === "Suit") {
            this.styleSprites.jacketL.setFillStyle(0x1f2b46);
            this.styleSprites.jacketR.setFillStyle(0x1f2b46);
            this.styleSprites.trousersL.setFillStyle(0x1a253d);
            this.styleSprites.trousersR.setFillStyle(0x1a253d);
            this.styleSprites.belt.setFillStyle(0xd9d9d9).setVisible(true);
            this.styleSprites.top.setFillStyle(0xf2f2f2).setSize(128, 56);
        } else if (outfit === "Jacket") {
            this.styleSprites.jacketL.setFillStyle(color);
            this.styleSprites.jacketR.setFillStyle(color);
            this.styleSprites.trousersL.setFillStyle(0x334455);
            this.styleSprites.trousersR.setFillStyle(0x334455);
            this.styleSprites.belt.setFillStyle(0x2a2a2a).setVisible(false);
            this.styleSprites.top.setFillStyle(0xe8f2ff).setSize(126, 56);
        } else if (outfit === "Royal") {
            this.styleSprites.jacketL.setFillStyle(0x5638b5);
            this.styleSprites.jacketR.setFillStyle(0x5638b5);
            this.styleSprites.trousersL.setFillStyle(0x3a2784);
            this.styleSprites.trousersR.setFillStyle(0x3a2784);
            this.styleSprites.belt.setFillStyle(0xd5b24f).setVisible(true);
            this.styleSprites.top.setFillStyle(0x9f7cff).setSize(132, 60);
        } else {
            this.styleSprites.jacketL.setFillStyle(color);
            this.styleSprites.jacketR.setFillStyle(color);
            this.styleSprites.trousersL.setFillStyle(0x2f4050);
            this.styleSprites.trousersR.setFillStyle(0x2f4050);
            this.styleSprites.belt.setFillStyle(0x2a2a2a).setVisible(true);
            this.styleSprites.top.setSize(126, 56);
        }

        if (this.hatGraphic) this.hatGraphic.destroy();
        if (this.glassesGraphic) this.glassesGraphic.destroy();

        this.hatGraphic = this.add.container(this.player.x, this.player.y - 50).setDepth(26);
        this.glassesGraphic = this.add.container(this.player.x, this.player.y - 30).setDepth(27);

        const hatStyle = this.hatStyles[this.hatIndex];
        if (hatStyle !== "None") {
            const brim = this.add.ellipse(0, 0, 74, 12, 0x2f3a48).setStrokeStyle(2, 0xffffff, 0.55);
            const crown = this.add.rectangle(0, -14, 48, 24, 0x49576a).setStrokeStyle(2, 0xffffff, 0.35);
            if (hatStyle === "Crown") {
                crown.setFillStyle(0xd0a94c);
                this.hatGraphic.add(this.add.triangle(-14, -28, -8, 0, 0, -14, 8, 0, 0xd8b762).setStrokeStyle(1, 0xffffff, 0.4));
                this.hatGraphic.add(this.add.triangle(0, -30, -8, 0, 0, -16, 8, 0, 0xd8b762).setStrokeStyle(1, 0xffffff, 0.4));
                this.hatGraphic.add(this.add.triangle(14, -28, -8, 0, 0, -14, 8, 0, 0xd8b762).setStrokeStyle(1, 0xffffff, 0.4));
            } else if (hatStyle === "Helmet") {
                crown.setWidth(60);
                crown.setHeight(30);
                crown.setFillStyle(0x708aa2);
            } else if (hatStyle === "Beanie") {
                crown.setFillStyle(0x7b4fb9);
            } else if (hatStyle === "Bucket") {
                brim.setWidth(74);
                crown.setWidth(64);
                crown.setHeight(22);
                crown.setFillStyle(0x607285);
            } else if (hatStyle === "Fedora") {
                crown.setFillStyle(0x5f4d41);
            }
            this.hatGraphic.add([brim, crown]);
        }

        const glassesStyle = this.glassesStyles[this.glassIndex];
        if (glassesStyle !== "None") {
            const ringColor = glassesStyle === "Sun" ? 0x131820 : 0xdbe5ef;
            const lensColor = glassesStyle === "Sun" ? 0x445c72 : 0xa8cbe4;
            
            // We removed leftLens and armL from here
            const rightLens = this.add.ellipse(13, 0, 24, 18, lensColor, 0.85).setStrokeStyle(2, ringColor);
            const bridge = this.add.rectangle(0, 0, 7, 3, ringColor);
            const armR = this.add.rectangle(24, 0, 8, 2, ringColor);

            if (glassesStyle === "Round") {
                rightLens.setWidth(22);
                rightLens.setHeight(22);
            }
            if (glassesStyle === "Goggles") {
                rightLens.setHeight(24);
                rightLens.setWidth(30);
            }
            
            // Only adding the right-side components to the container
            this.glassesGraphic.add([rightLens, bridge, armR]);
        }

        this.refreshStyleText();
    }

    closeWardrobePanel() {
        this.wardrobeObjects.forEach((obj) => obj.destroy());
        this.wardrobeObjects = [];
        this.wardrobeOpen = false;
    }

    openWardrobePanel() {
        this.closeWardrobePanel();
        this.wardrobeOpen = true;

        const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.45).setDepth(120);
        const panel = this.add.rectangle(W / 2, H / 2, 800, 450, 0xffffff, 0.98).setStrokeStyle(8, 0xa38de9).setDepth(121);
        const title = this.add.text(W / 2, 186, "WARDROBE STUDIO", {
            fontSize: "44px", color: "#5a3f9d", fontStyle: "bold", stroke: "#ffffff", strokeThickness: 4
        }).setOrigin(0.5).setDepth(122);
        this.wardrobeObjects.push(overlay, panel, title);

        const makeButton = (x, y, label, action) => {
            const b = uiButton(this, x, y, 220, 78, label, action, 0xc9b5ff, 0xa88cf0);
            b.btn.setDepth(122);
            b.label.setDepth(123).setFontSize("24px");
            this.wardrobeObjects.push(b.btn, b.label);
        };

        makeButton(430, 286, "CHANGE CLOTHES", () => {
            this.styleIndex = (this.styleIndex + 1) % this.outfitStyles.length;
            STATE.outfit.styleIndex = this.styleIndex;
            this.applyStyleVisuals();
        });
        makeButton(850, 286, "CHANGE HAT", () => {
            this.hatIndex = (this.hatIndex + 1) % this.hatStyles.length;
            STATE.outfit.hatIndex = this.hatIndex;
            this.applyStyleVisuals();
        });
        makeButton(430, 390, "CHANGE GLASSES", () => {
            this.glassIndex = (this.glassIndex + 1) % this.glassesStyles.length;
            STATE.outfit.glassIndex = this.glassIndex;
            this.applyStyleVisuals();
        });
        makeButton(850, 390, "CHANGE COLOR", () => {
            this.colorIndex = (this.colorIndex + 1) % this.palette.length;
            STATE.outfit.colorIndex = this.colorIndex;
            this.applyStyleVisuals();
        });

        const close = uiButton(this, W / 2, 510, 230, 72, "DONE", () => this.closeWardrobePanel(), 0xff9aa1, 0xff727d);
        close.btn.setDepth(122);
        close.label.setDepth(123).setFontSize("28px");
        this.wardrobeObjects.push(close.btn, close.label);
    }

    useStation(station) {
        if (this.playerBusy || this.time.now < station.cooldownUntil) return;
        if (station.id === "closet") {
    this.openWardrobePanel();
    
    // Move the text down (adjust +40 to whatever distance feels right)
    const originalY = this.effectText.y;
    this.effectText.setY(originalY + 40); 
    
    this.effectText.setText("Wardrobe open: choose clothes, hat, glasses, colors.");

    // Reset the position when the user is done or after a delay 
    // (or reset it at the start of useStation)
    return;
}

        this.playerBusy = true;
        station.cooldownUntil = this.time.now + 2200;
        this.player.body.setVelocityX(0);

        this.tweens.add({
            targets: this.player,
            x: station.x - 34,
            duration: 260,
            ease: "Quad.easeOut",
            onComplete: () => {
                let effect = "";
                if (station.id === "bed") {
                    this.sleeping = true;
                    setCrocBlink(this.player, true);
                    setCrocExpression(this.player, "tired");
                    this.tweens.add({
                        targets: this.player,
                        x: 250,
                        y: this.floorY - 92,
                        scaleY: 0.72,
                        duration: 380,
                    });

                    this.sleepBlanket = this.add.rectangle(228, this.floorY - 70, 170, 30, 0xf3a1c4, 0.92)
                        .setStrokeStyle(2, 0xffffff, 0.7)
                        .setDepth(24);

                    const zzzTimer = this.time.addEvent({
                        delay: 260,
                        repeat: 7,
                        callback: () => {
                            const z = this.add.text(this.player.x + Phaser.Math.Between(-12, 18), this.player.y - 60, "Z", {
                                fontSize: "30px", color: "#ffffff", fontStyle: "bold", stroke: "#6a4fb2", strokeThickness: 3,
                            }).setDepth(50);
                            this.tweens.add({ targets: z, y: z.y - 40, alpha: 0, duration: 850, onComplete: () => z.destroy() });
                        }
                    });

                    this.time.delayedCall(2400, () => {
                        zzzTimer.remove(false);
                        this.tweens.add({
                            targets: this.player,
                            x: station.x - 34,
                            y: this.floorY - 74,
                            scaleY: 1,
                            duration: 300,
                        });
                        if (this.sleepBlanket) {
                            this.sleepBlanket.destroy();
                            this.sleepBlanket = null;
                        }
                        setCrocBlink(this.player, false);
                        setCrocExpression(this.player, "happy");
                        STATE.energy = Math.min(100, STATE.energy + 20);
                        STATE.mood = Math.min(100, STATE.mood + 10);
                        effect = "Deep sleep done. Woke up refreshed: energy +20, mood +10";
                        this.effectText.setText(effect);
                        addToast(this, "Slept and woke up refreshed", "#fff6c5");
                        this.sleeping = false;
                        this.time.delayedCall(700, () => {
                            this.playerBusy = false;
                            setCrocExpression(this.player, "neutral");
                        });
                    });
                    return;
                }

                if (station.id === "desk") {
                    // Croc sits vertically on the centered desk chair.
                    this.tweens.add({
                        targets: this.player,
                        x: 930,
                        y: this.floorY - 108,
                        scaleY: 0.82,
                        duration: 320,
                        onComplete: () => {
                            setCrocExpression(this.player, "focused");
                            // Pick a random computer activity
                            const activities = [
                                { label: "Playing a game!", color: "#ff9900", anim: "game" },
                                { label: "Browsing the web!", color: "#44aaff", anim: "web" },
                                { label: "Watching videos!", color: "#ff5555", anim: "video" },
                                { label: "Writing notes!", color: "#88cc55", anim: "notes" },
                            ];
                            const act = Phaser.Utils.Array.GetRandom(activities);
                            // Screen activity visual
                            const screenAct = this.add.container(930, 450).setDepth(46);
                            if (act.anim === "game") {
                                // Game pixels on screen
                                const bg = this.add.rectangle(0, 0, 90, 46, 0x1a2a0a);
                                const p1 = this.add.rectangle(-28, 8, 12, 12, 0x66ff44);
                                const p2 = this.add.rectangle(10, -8, 8, 8, 0xff4466);
                                const p3 = this.add.rectangle(28, 10, 10, 10, 0xffcc44);
                                const bar = this.add.rectangle(0, 18, 60, 5, 0x33ff66);
                                screenAct.add([bg, p1, p2, p3, bar]);
                                this.tweens.add({ targets: [p1, p2, p3], x: '+=8', duration: 200, yoyo: true, repeat: 6 });
                            } else if (act.anim === "web") {
                                const bg = this.add.rectangle(0, 0, 90, 46, 0xfafafa);
                                const topBar = this.add.rectangle(0, -16, 88, 10, 0x3090e0);
                                const line1 = this.add.rectangle(-5, -4, 70, 4, 0xbbbbbb);
                                const line2 = this.add.rectangle(-10, 4, 60, 4, 0xdddddd);
                                const line3 = this.add.rectangle(-15, 12, 50, 4, 0xcccccc);
                                screenAct.add([bg, topBar, line1, line2, line3]);
                                this.tweens.add({ targets: [line1, line2, line3], y: '-=22', duration: 1200, yoyo: true, repeat: 2 });
                            } else if (act.anim === "video") {
                                const bg = this.add.rectangle(0, 0, 90, 46, 0x111111);
                                const img = this.add.rectangle(0, -4, 78, 34, 0x2244aa);
                                const playBtn = this.add.triangle(0, -4, -10, -12, -10, 12, 14, 0, 0xffffff, 0.9);
                                const progress = this.add.rectangle(-20, 18, 40, 4, 0xff3333);
                                screenAct.add([bg, img, playBtn, progress]);
                                this.tweens.add({ targets: progress, scaleX: 1.8, duration: 1500 });
                            } else {
                                const bg = this.add.rectangle(0, 0, 90, 46, 0xfffde8);
                                for (let li = 0; li < 5; li++) {
                                    const line = this.add.rectangle(-5, -16 + li * 9, Phaser.Math.Between(40, 75), 3, 0x888888);
                                    screenAct.add(line);
                                }
                            }
                            // Activity label popup
                            const actLabel = this.add.text(930, 395, act.label, {
                                fontSize: "18px", color: act.color, fontStyle: "bold",
                                stroke: "#000000", strokeThickness: 3
                            }).setOrigin(0.5).setDepth(47);
                            this.tweens.add({ targets: actLabel, y: 375, alpha: 0, duration: 1400, delay: 600, onComplete: () => actLabel.destroy() });

                            this.time.delayedCall(2000, () => {
                                screenAct.destroy();
                                this.tweens.add({
                                    targets: this.player,
                                    x: station.x - 34,
                                    y: this.floorY - 74,
                                    scaleY: 1,
                                    duration: 320,
                                });
                                STATE.stars += 2;
                                STATE.mood = Math.min(100, STATE.mood + 5);
                                effect = `${act.label} Seated desk session done: stars +2, mood +5`;
                                this.effectText.setText(effect);
                                addToast(this, effect, "#fff6c5");
                                this.time.delayedCall(500, () => {
                                    this.playerBusy = false;
                                    setCrocExpression(this.player, "neutral");
                                });
                            });
                        }
                    });
                    return;
                }

                this.effectText.setText(effect);
                addToast(this, effect, "#fff6c5");
                this.time.delayedCall(900, () => {
                    this.playerBusy = false;
                    setCrocExpression(this.player, "neutral");
                });
            }
        });
    }

    update() {
       if (!this.player || !this.player.body) return;

    // 2. Define facing direction once
    const facing = this.player.scaleX >= 0 ? 1 : -1;

    // 3. Keep outfit pieces aligned (Only if they exist)
    // 3. Keep outfit pieces aligned (Only if they exist)
    if (this.styleSprites && this.styleSprites.top) {
        // --- SHIRT (LIFTED & CENTERED) ---
        // Change -10 to -20 to lift HIGHER | Change 0 to move FORWARD/BACK
        this.styleSprites.top.x = this.player.x + (0 * facing);
        this.styleSprites.top.y = this.player.y - 10; 
        this.styleSprites.top.scaleX = facing;

        // --- JACKET (ALIGNED TO SHIRT) ---
        this.styleSprites.jacketL.x = this.player.x - (26 * facing);
        this.styleSprites.jacketL.y = this.player.y - 10; // Match shirt height
        this.styleSprites.jacketL.scaleX = facing;

        this.styleSprites.jacketR.x = this.player.x + (46 * facing);
        this.styleSprites.jacketR.y = this.player.y - 10; // Match shirt height
        this.styleSprites.jacketR.scaleX = facing;

        // --- TROUSERS (LIFTED) ---
        // Change +30 to +20 to lift pants higher
        this.styleSprites.trousersL.x = this.player.x - (25 * facing);
        this.styleSprites.trousersL.y = this.player.y + 30;
        this.styleSprites.trousersL.scaleX = facing;

        this.styleSprites.trousersR.x = this.player.x + (28 * facing);
        this.styleSprites.trousersR.y = this.player.y + 30;
        this.styleSprites.trousersR.scaleX = facing;

        // --- BELT ---
        this.styleSprites.belt.x = this.player.x + (10 * facing);
        this.styleSprites.belt.y = this.player.y + 15;
        this.styleSprites.belt.scaleX = facing;
    }
        // Anchor accessories to measured crocodile head and eye coordinates.
       if (this.hatGraphic) {
            this.hatGraphic.x = this.player.x + (87 * facing);
            this.hatGraphic.y = this.player.y - 80;
            this.hatGraphic.scaleX = facing;
        }

        // 3. Anchor Glasses: The offset (65) must be multiplied by facing
        if (this.glassesGraphic) {
            this.glassesGraphic.x = this.player.x + (68 * facing);
            this.glassesGraphic.y = this.player.y - 55;
            this.glassesGraphic.scaleX = facing;
        }

        const nearest = this.stations.slice().sort((a, b) => Math.abs(this.player.x - a.x) - Math.abs(this.player.x - b.x))[0];
        const nearEnough = nearest && Math.abs(this.player.x - nearest.x) < 135;
        this.promptText.setText(nearEnough ? `Press E: ${nearest.prompt}` : "Move near a bedroom station and press E");

        if (!this.playerBusy && !this.wardrobeOpen) {
            let vx = 0;
            if (this.keys.left.isDown || this.keys.arrowLeft.isDown || this.phoneControls.isDown("left")) vx -= 220;
            if (this.keys.right.isDown || this.keys.arrowRight.isDown || this.phoneControls.isDown("right")) vx += 220;
            this.player.body.setVelocityX(vx);
            this.player.y = this.floorY - 74;

            if (vx > 8) {
                setCrocFacing(this.player, 1);
                setCrocExpression(this.player, "neutral");
            } else if (vx < -8) {
                setCrocFacing(this.player, -1);
                setCrocExpression(this.player, "focused");
            }
        } else {
            this.player.body.setVelocityX(0);
        }

        if ((Phaser.Input.Keyboard.JustDown(this.keys.e) || this.phoneControls.consume("e")) && nearEnough) {
            this.useStation(nearest);
        }
    }
}

class LibraryScene extends Phaser.Scene {
    constructor() {
        super("LibraryScene");
    }

    create() {
        setSceneMusic("background");
        this.worldWidth = 3600;
        this.floorY = 622;
        this.playerBusy = false;
        this.bookInHand = null;
        this.dialogOpen = false;
        this.dialogObjects = [];
        this.libMouthTween = null;
        this.readingSpotX = 900;
        this.pickedBook = null;
        this.inQuietRoom = false;
        this.quietRoomObjects = [];

        this.add.rectangle(this.worldWidth / 2, H / 2, this.worldWidth, H, 0xe8dcc6);
        this.add.rectangle(this.worldWidth / 2, 150, this.worldWidth, 260, 0xd5c2a1);
        this.add.rectangle(this.worldWidth / 2, this.floorY + 72, this.worldWidth, 210, 0x825f43);
        this.add.rectangle(this.worldWidth / 2, this.floorY + 14, this.worldWidth, 18, 0x5d402e);

        // Grand side-scroller library structure.
        for (let i = 0; i < 9; i++) {
            const x = 230 + i * 290;
            this.add.rectangle(x, 430, 210, 300, 0x7b553d).setStrokeStyle(4, 0xd7c3aa).setDepth(2);
            this.add.rectangle(x, 314, 196, 18, 0x5f402d).setDepth(3);
            this.add.rectangle(x, 396, 196, 18, 0x5f402d).setDepth(3);
            this.add.rectangle(x, 478, 196, 18, 0x5f402d).setDepth(3);

            for (let row = 0; row < 2; row++) {
                for (let b = 0; b < 8; b++) {
                    const bx = x - 90 + b * 16;
                    const by = 334 + row * 82;
                    const color = Phaser.Utils.Array.GetRandom([0xa43f3f, 0x3f5fa4, 0x3fa46a, 0xa47d3f, 0x8a3fa4]);
                    this.add.rectangle(bx, by, 11, 32, color).setDepth(4).setStrokeStyle(1, 0xffffff, 0.35);
                }
            }
        }

        // Reading tables and ladders for realism.
        for (let i = 0; i < 6; i++) {
            const tx = 350 + i * 550;
            this.add.rectangle(tx, 575, 210, 52, 0x9c6d48).setStrokeStyle(3, 0xffffff, 0.6).setDepth(5);
            this.add.rectangle(tx - 70, 560, 28, 22, 0x32506f).setDepth(6);
            this.add.rectangle(tx + 70, 560, 28, 22, 0x32506f).setDepth(6);
            this.add.rectangle(tx + 120, 510, 30, 170, 0xb69771).setDepth(4);
            for (let r = 0; r < 7; r++) {
                this.add.rectangle(tx + 120, 448 + r * 22, 42, 3, 0x8b6b4a).setDepth(5);
            }
        }

        // Big ladder to underground rooms.
        this.add.rectangle(520, 500, 42, 220, 0xb69771).setDepth(6);
        for (let r = 0; r < 10; r++) {
            this.add.rectangle(520, 418 + r * 22, 64, 4, 0x8b6b4a).setDepth(7);
        }
        this.add.text(520, 392, "DOWN TO QUIET ROOMS", {
            fontSize: "14px", color: "#fff6df", fontStyle: "bold", stroke: "#5e422e", strokeThickness: 3
        }).setOrigin(0.5).setDepth(8);

        // Reading spot with a free table and chair.
        this.add.rectangle(this.readingSpotX, 562, 160, 34, 0x9c6d48).setStrokeStyle(2, 0xffffff, 0.6).setDepth(6);
        this.add.rectangle(this.readingSpotX - 54, 590, 10, 24, 0x7b553d).setDepth(5);
        this.add.rectangle(this.readingSpotX + 54, 590, 10, 24, 0x7b553d).setDepth(5);
        this.add.rectangle(this.readingSpotX - 74, 548, 60, 72, 0x7b553d).setStrokeStyle(2, 0xd7c3aa).setDepth(6);
        this.add.rectangle(this.readingSpotX - 74, 580, 62, 26, 0x9c6d48).setStrokeStyle(2, 0xd7c3aa).setDepth(7);
        // Lamp next to reading spot
        this.add.rectangle(this.readingSpotX + 70, 540, 6, 80, 0x8b6b4a).setDepth(5);
        this.add.ellipse(this.readingSpotX + 70, 498, 44, 24, 0xfff0c0, 0.9).setStrokeStyle(2, 0xe0b840).setDepth(6);
        this.add.text(this.readingSpotX, 508, "READING SPOT", {
            fontSize: "14px", color: "#5e422e", fontStyle: "bold", stroke: "#ffffff", strokeThickness: 2
        }).setOrigin(0.5).setDepth(7);

        // Librarian desk and single front chair.
        this.add.rectangle(220, 544, 150, 42, 0x8f633f).setStrokeStyle(3, 0xdcc3a8).setDepth(5);
        this.add.rectangle(220, 518, 136, 18, 0x7f5838).setDepth(5);
        this.add.rectangle(220, 576, 86, 70, 0x6d4e37).setStrokeStyle(2, 0xcaa886).setDepth(4);
        this.add.rectangle(220, 542, 90, 22, 0x836047).setStrokeStyle(2, 0xd8bb9e).setDepth(4);

        // Librarian chair (depth behind bear at depth=10)
        this.add.rectangle(220, this.floorY - 100, 74, 14, 0x5c4a38).setStrokeStyle(2, 0xd0a878).setDepth(8); // seat
        this.add.rectangle(220, this.floorY - 127, 10, 68, 0x4a3829).setStrokeStyle(1, 0xb08050).setDepth(8); // backrest
        this.add.rectangle(206, this.floorY - 73, 8, 52, 0x3d2e1f).setDepth(7); // left leg
        this.add.rectangle(234, this.floorY - 73, 8, 52, 0x3d2e1f).setDepth(7); // right leg

        // Seated animated bear librarian — positioned to sit in chair
        this.librarian = drawBear(this, 220, this.floorY - 140, 0.72).setDepth(10);
        this.librarian.setScale(0.72, 0.54);
        // The bear's internal mouth (bearParts.mouth) is animated by startLibrarianSpeaking
        this.add.text(220, this.floorY - 198, "LIBRARIAN", {
            fontSize: "18px", color: "#fff6df", fontStyle: "bold", stroke: "#5e422e", strokeThickness: 3
        }).setOrigin(0.5).setDepth(11);
        // Speech bubble above librarian (shows when idle)
        this.libBubble = this.add.container(220, 395).setDepth(13);
        const libBubbleBg = this.add.ellipse(0, 0, 130, 44, 0xfff9e8, 0.95).setStrokeStyle(2, 0x9c6d48);
        const libBubbleTxt = this.add.text(0, 0, "Welcome!", {
            fontSize: "13px", color: "#5e3e1e", fontStyle: "bold"
        }).setOrigin(0.5);
        this.libBubble.add([libBubbleBg, libBubbleTxt]);
        // Very subtle idle bob so the seated pose remains stable.
        this.tweens.add({ targets: this.librarian, y: this.librarian.y - 2, duration: 1700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

        this.add.text(W / 2, 52, "GRAND LIBRARY", {
            fontSize: "48px", color: "#ffffff", fontStyle: "bold", stroke: "#5e422e", strokeThickness: 5,
        }).setOrigin(0.5).setScrollFactor(0);

        this.player = drawCroc(this, 180, this.floorY - 74, 0.78).setDepth(20);
        this.physics.add.existing(this.player);
        this.player.body.setAllowGravity(false);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(185, 78, true);

        this.physics.world.setBounds(0, 0, this.worldWidth, H);
        this.cameras.main.setBounds(0, 0, this.worldWidth, H);
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -W * 0.2, 20);

        this.keys = this.input.keyboard.addKeys({
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            e: Phaser.Input.Keyboard.KeyCodes.E,
            arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
            arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        });
        this.phoneControls = createPhoneControls(this, { e: true });

        this.statusText = this.add.text(48, 150, "Pick up a book, then walk to the Reading Spot to read it.", {
            fontSize: "22px", color: "#4a3426", fontStyle: "bold"
        }).setScrollFactor(0);
        this.effectText = this.add.text(24, 185, "", {
            fontSize: "20px", color: "#3d663b", fontStyle: "bold"
        }).setScrollFactor(0);

        // Held book visual (appears when croc picked up a book)
        this.heldBookProp = null;

        this.stations = [
            { id: "librarian", x: 220, prompt: "Ask the librarian a question", cooldownUntil: 0 },
            { id: "ladder", x: 520, prompt: "Go down ladder to quiet rooms", cooldownUntil: 0 },
            { id: "readingSpot", x: this.readingSpotX, prompt: "Sit and read your book here", cooldownUntil: 0 },
            { id: "history", x: 500, prompt: "Pick up History book", cooldownUntil: 0 },
            { id: "science", x: 1320, prompt: "Pick up Science book", cooldownUntil: 0 },
            { id: "literature", x: 2140, prompt: "Pick up Literature book", cooldownUntil: 0 },
            { id: "archive", x: 2920, prompt: "Pick up Archive book", cooldownUntil: 0 },
        ];

        this.promptText = this.add.text(W / 2, H - 34, "Move near a section and press E", {
            fontSize: "20px", color: "#ffffff", fontStyle: "bold", stroke: "#5f4532", strokeThickness: 3,
        }).setOrigin(0.5).setScrollFactor(0);

        const homeBtn = uiButton(this, W - 100, 44, 170, 52, "HOME", () => this.scene.start("HubScene"), 0xff7d7d, 0xff5858);
        homeBtn.btn.setScrollFactor(0);
        homeBtn.label.setScrollFactor(0);
    }

    // Animate librarian mouth speaking — uses the bear's OWN mouth shape
    startLibrarianSpeaking(duration = 2500) {
        const mouthShape = this.librarian?.bearParts?.mouth;
        if (!mouthShape) return;
        if (this.libMouthTween) this.libMouthTween.stop();
        this.libMouthTween = this.tweens.add({
            targets: mouthShape,
            scaleY: 2.8,
            duration: 140,
            yoyo: true,
            repeat: Math.floor(duration / 280),
            onComplete: () => {
                mouthShape.scaleY = 1;
            }
        });
    }

    closeDialog() {
        this.dialogObjects.forEach(o => { if (o && o.destroy) o.destroy(); });
        this.dialogObjects = [];
        this.dialogOpen = false;
        this.playerBusy = false;
    }

    closeQuietRoom() {
        this.quietRoomObjects.forEach((o) => o.destroy());
        this.quietRoomObjects = [];
        this.inQuietRoom = false;
        this.playerBusy = false;
    }

    openQuietRoom() {
        if (this.inQuietRoom) return;
        if (!this.pickedBook) {
            addToast(this, "Pick a book first, then use the ladder.", "#ffddaa");
            return;
        }
        this.inQuietRoom = true;
        this.playerBusy = true;

        const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x0e1626, 0.95).setDepth(170).setScrollFactor(0);
        const room = this.add.rectangle(W / 2, H / 2, 920, 560, 0x24324c).setStrokeStyle(6, 0x9db4d8).setDepth(171).setScrollFactor(0);
        const lamp = this.add.circle(W / 2, 180, 60, 0xffe9a0, 0.35).setDepth(172).setScrollFactor(0);
        const table = this.add.rectangle(W / 2, 460, 360, 60, 0x8f633f).setStrokeStyle(3, 0xdcc3a8).setDepth(172).setScrollFactor(0);
        const title = this.add.text(W / 2, 138, "UNDERGROUND READING ROOMS", {
            fontSize: "34px", color: "#ffffff", fontStyle: "bold", stroke: "#1a1f2a", strokeThickness: 4
        }).setOrigin(0.5).setDepth(173).setScrollFactor(0);

        const info = this.add.text(W / 2, 226,
            `You brought a ${this.pickedBook.toUpperCase()} book. Choose a room and read peacefully.`, {
            fontSize: "20px", color: "#dce8ff", align: "center", wordWrap: { width: 760 }
        }).setOrigin(0.5).setDepth(173).setScrollFactor(0);

        const readInRoom = (roomName, bonusMood, bonusStars) => {
            const book = this.add.rectangle(W / 2, 430, 90, 56, 0x6e87b2).setStrokeStyle(2, 0xe6eef8).setDepth(174).setScrollFactor(0);
            const page = this.add.rectangle(W / 2 + 8, 430, 52, 40, 0xf6f1e6).setStrokeStyle(1, 0xd5c9b7).setDepth(175).setScrollFactor(0);
            this.tweens.add({ targets: page, scaleX: 0.2, duration: 180, yoyo: true, repeat: 7 });

            const bonus = this.pickedBook === "archive" ? bonusStars + 1 : bonusStars;
            const coinBonus = this.pickedBook === "archive" ? 12 : 7;
            STATE.stars += bonus;
            STATE.coins += coinBonus;
            STATE.mood = Math.min(100, STATE.mood + bonusMood);
            STATE.energy = Math.max(25, STATE.energy - 2);
            this.effectText.setText(`${roomName} reading: stars +${bonus}, coins +${coinBonus}, mood +${bonusMood}`);
            addToast(this, `${roomName} reading complete`, "#fff6c5");

            this.time.delayedCall(1200, () => {
                book.destroy();
                page.destroy();
            });
        };

        const roomABtn = uiButton(this, W / 2 - 250, 560, 220, 62, "ROOM A", () => readInRoom("Room A", 8, 3), 0x5e7ecf, 0x4a66a8);
        roomABtn.btn.setDepth(173).setScrollFactor(0);
        roomABtn.label.setDepth(174).setScrollFactor(0);

        const roomBBtn = uiButton(this, W / 2, 560, 220, 62, "ROOM B", () => readInRoom("Room B", 9, 3), 0x6c92d4, 0x5377b6);
        roomBBtn.btn.setDepth(173).setScrollFactor(0);
        roomBBtn.label.setDepth(174).setScrollFactor(0);

        const roomCBtn = uiButton(this, W / 2 + 250, 560, 220, 62, "ROOM C", () => readInRoom("Room C", 10, 4), 0x7aa4dd, 0x628cc6);
        roomCBtn.btn.setDepth(173).setScrollFactor(0);
        roomCBtn.label.setDepth(174).setScrollFactor(0);

        const exitBtn = uiButton(this, W / 2, 622, 220, 52, "EXIT ROOMS", () => this.closeQuietRoom(), 0xcc6666, 0xbf4f4f);
        exitBtn.btn.setDepth(173).setScrollFactor(0);
        exitBtn.label.setDepth(174).setScrollFactor(0);

        this.quietRoomObjects.push(
            overlay, room, lamp, table, title, info,
            roomABtn.btn, roomABtn.label,
            roomBBtn.btn, roomBBtn.label,
            roomCBtn.btn, roomCBtn.label,
            exitBtn.btn, exitBtn.label
        );
    }

    openLibrarianDialog() {
        if (this.dialogOpen) return;
        this.dialogOpen = true;
        this.playerBusy = true;

        const camX = this.cameras.main.scrollX;
        const cx = camX + W / 2;

        const overlay = this.add.rectangle(cx, H / 2, W, H, 0x000000, 0.55).setDepth(130).setScrollFactor(0);
        const panel = this.add.rectangle(cx, H / 2, 840, 500, 0xfff9ee, 0.98).setStrokeStyle(8, 0x9c6d48).setDepth(131).setScrollFactor(0);

        // Bear librarian mini-portrait
        const portrait = drawBear(this, cx - 310, 240, 0.5).setScrollFactor(0).setDepth(132);
        // Animated mouth in portrait
        const portraitMouth = this.add.ellipse(cx - 310, 215, 16, 5, 0x3a1a0a).setDepth(133).setScrollFactor(0);
        this.tweens.add({
            targets: portraitMouth,
            scaleY: 2.0,
            duration: 160,
            yoyo: true,
            repeat: 12,
        });

        const title = this.add.text(cx + 30, 175, "LIBRARIAN SAYS:", {
            fontSize: "28px", color: "#5e3e1e", fontStyle: "bold", stroke: "#ffffff", strokeThickness: 3
        }).setOrigin(0.5).setDepth(132).setScrollFactor(0);

        const answerTxt = this.add.text(cx + 30, 280, "What would you like to ask?", {
            fontSize: "19px", color: "#3d2408", wordWrap: { width: 460 }, align: "center"
        }).setOrigin(0.5).setDepth(132).setScrollFactor(0);

        const topics = [
            { label: "How to study well?", key: "study" },
            { label: "About History books?", key: "history" },
            { label: "About Science books?", key: "science" },
            { label: "Just browsing...", key: "browse" },
        ];
        const answers = {
            study: "Focus on one shelf at a time! Read slowly, and in your mind summarize each page. Short breaks keep your energy up!",
            history: "The History shelves teach timelines and cause-effect. Link every event to WHY it happened and WHAT changed after!",
            science: "Science is about testing one idea at a time. Write your observations before drawing conclusions. Curiosity is key!",
            sleep: "Sleep first, then study! After rest your croc brain works much better. Short focused sessions beat long tired ones!",
            coins: "Every book you read in the Library gives you stars and coins. The Archive shelf gives the biggest reward!",
            browse: "Of course, dear visitor! All knowledge is yours for the taking. Explore every shelf at your own pace!",
        };

        topics.forEach((t, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const bx = cx - 165 + col * 330;
            const by = 370 + row * 58;
            const btn = this.add.rectangle(bx, by, 300, 48, 0xd4a96a).setStrokeStyle(3, 0x8b5e32).setDepth(133).setScrollFactor(0).setInteractive({ useHandCursor: true });
            const lbl = this.add.text(bx, by, t.label, { fontSize: "16px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5).setDepth(134).setScrollFactor(0);
            btn.on("pointerover", () => btn.setFillStyle(0xe8bf88));
            btn.on("pointerout", () => btn.setFillStyle(0xd4a96a));
            btn.on("pointerdown", () => {
                answerTxt.setText(answers[t.key] || "Thank you for visiting!");
                this.startLibrarianSpeaking(2400);
                addToast(this, "Librarian answered!", "#fff6c5");
                STATE.mood = Math.min(100, STATE.mood + 2);
            });
            this.dialogObjects.push(btn, lbl);
        });

        const closeBtn = this.add.rectangle(cx, 548, 200, 52, 0xcc5555).setStrokeStyle(3, 0xffffff).setDepth(133).setScrollFactor(0).setInteractive({ useHandCursor: true });
        const closeLbl = this.add.text(cx, 548, "CLOSE", { fontSize: "22px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5).setDepth(134).setScrollFactor(0);
        closeBtn.on("pointerdown", () => this.closeDialog());

        this.dialogObjects.push(overlay, panel, portrait, portraitMouth, title, answerTxt, closeBtn, closeLbl);
        // Start librarian speaking on open
        this.startLibrarianSpeaking(1600);
    }

    useStation(station) {
        if (this.playerBusy || this.time.now < station.cooldownUntil) return;

        if (station.id === "librarian") {
            station.cooldownUntil = this.time.now + 1000;
            this.openLibrarianDialog();
            return;
        }

        if (station.id === "ladder") {
            station.cooldownUntil = this.time.now + 1200;
            this.openQuietRoom();
            return;
        }

        // Book shelf stations — immediate pickup when selected.
        if (["history", "science", "literature", "archive"].includes(station.id)) {
            if (this.pickedBook) {
                // Return book flow.
                if (station.id === this.pickedBook) {
                    this.pickedBook = null;
                    if (this.heldBookProp) {
                        this.heldBookProp.destroy();
                        this.heldBookProp = null;
                    }
                    this.effectText.setText(`Book returned to ${station.id} shelf. Pick another book.`);
                    addToast(this, "Book returned successfully", "#d4f8c4");
                } else {
                    addToast(this, `You are holding a ${this.pickedBook} book. Return it to its shelf first.`, "#ffe0aa");
                }
                return;
            }
            station.cooldownUntil = this.time.now + 900;
            setCrocExpression(this.player, "happy");
            this.pickedBook = station.id;

            if (this.heldBookProp) this.heldBookProp.destroy();
            this.heldBookProp = this.add.container(this.player.x + 72, this.player.y - 28).setDepth(40);
            const bookColors = { history: 0xa43f3f, science: 0x3f5fa4, literature: 0x3fa46a, archive: 0xa47d3f };
            const cover = this.add.rectangle(0, 0, 38, 52, bookColors[station.id] || 0x6e87b2).setStrokeStyle(2, 0xe6eef8);
            const spine = this.add.rectangle(-16, 0, 5, 52, 0x2a2a2a, 0.5);
            const line1 = this.add.rectangle(4, -8, 22, 3, 0xffffff, 0.6);
            const line2 = this.add.rectangle(4, 0, 16, 3, 0xffffff, 0.4);
            this.heldBookProp.add([cover, spine, line1, line2]);

            this.effectText.setText(`Picked up ${station.id} book immediately. Read at table or go down ladder.`);
            this.statusText.setText("Book in hand — table read or quiet rooms.");
            addToast(this, `${station.id} book picked.`, "#d4f8c4");
            return;
        }

        // Reading Spot — sit and read the book
        if (station.id === "readingSpot") {
            if (!this.pickedBook) {
                addToast(this, "Pick up a book from a shelf first!", "#ffddaa");
                return;
            }
            this.playerBusy = true;
            station.cooldownUntil = this.time.now + 4000;
            this.player.body.setVelocityX(0);

            this.tweens.add({
                targets: this.player,
                x: this.readingSpotX - 70,
                y: this.floorY - 102,
                scaleY: 0.84,
                duration: 320,
                ease: "Quad.easeOut",
                onComplete: () => {
                    setCrocExpression(this.player, "focused");
                    setCrocBlink(this.player, false);

                    // Place held book on table with a calm closed-book reading motion.
                    if (this.heldBookProp) {
                        this.tweens.add({
                            targets: this.heldBookProp,
                            x: this.readingSpotX + 6,
                            y: 546,
                            duration: 280,
                        });
                        this.tweens.add({
                            targets: this.heldBookProp.list[0],
                            angle: 4,
                            duration: 260,
                            yoyo: true,
                            repeat: 5,
                        });
                    }

                    const bonus = this.pickedBook === "archive" ? 3 : 2;
                    const coinBonus = this.pickedBook === "archive" ? 10 : 6;
                    const moodBonus = this.pickedBook === "literature" ? 8 : 6;

                    this.time.delayedCall(2800, () => {
                        // Stand back up
                        this.tweens.add({
                            targets: this.player,
                            y: this.floorY - 74,
                            scaleY: 1,
                            duration: 280,
                        });

                        if (this.heldBookProp) {
                            this.tweens.add({ targets: this.heldBookProp, alpha: 0, y: this.heldBookProp.y - 40, duration: 400, onComplete: () => {
                                this.heldBookProp.destroy();
                                this.heldBookProp = null;
                            }});
                        }

                        STATE.stars += bonus;
                        STATE.coins += coinBonus;
                        STATE.mood = Math.min(100, STATE.mood + moodBonus);
                        STATE.energy = Math.max(25, STATE.energy - 3);

                        const effect = `Read ${this.pickedBook} book! Stars +${bonus}, coins +${coinBonus}, mood +${moodBonus}`;
                        this.pickedBook = null;
                        this.effectText.setText(effect);
                        this.statusText.setText("Pick up another book to read.");
                        addToast(this, effect, "#fff6c5");

                        setCrocExpression(this.player, "neutral");
                        this.playerBusy = false;
                    });
                }
            });
        }
    }

    update() {
        // Keep held book glued to player as they walk
        if (this.heldBookProp && this.pickedBook) {
            const facing = this.player.scaleX >= 0 ? 1 : -1;
            this.heldBookProp.x = this.player.x + 72 * facing;
            this.heldBookProp.y = this.player.y - 28;
            this.heldBookProp.scaleX = facing;
        }

        const nearest = this.stations.slice().sort((a, b) => Math.abs(this.player.x - a.x) - Math.abs(this.player.x - b.x))[0];
        const nearEnough = nearest && Math.abs(this.player.x - nearest.x) < 145;
        this.promptText.setText(nearEnough ? `Press E: ${nearest.prompt}` : "Move near a section and press E");

        if (!this.playerBusy && !this.dialogOpen) {
            let vx = 0;
            if (this.keys.left.isDown || this.keys.arrowLeft.isDown || this.phoneControls.isDown("left")) vx -= 220;
            if (this.keys.right.isDown || this.keys.arrowRight.isDown || this.phoneControls.isDown("right")) vx += 220;
            this.player.body.setVelocityX(vx);
            this.player.y = this.floorY - 74;
            if (vx > 8) {
                setCrocFacing(this.player, 1);
                setCrocExpression(this.player, "neutral");
            } else if (vx < -8) {
                setCrocFacing(this.player, -1);
                setCrocExpression(this.player, "focused");
            }
        } else {
            this.player.body.setVelocityX(0);
        }

        if ((Phaser.Input.Keyboard.JustDown(this.keys.e) || this.phoneControls.consume("e")) && nearEnough && !this.dialogOpen) {
            this.useStation(nearest);
        }
    }
}

class ToiletScene extends Phaser.Scene {
    constructor() {
        super("ToiletScene");
    }

    create() {
        setSceneMusic("background");
        this.floorY = 620;
        this.playerBusy = false;
        this.soapLoaded = false;
        this.toothpasteLoaded = false;

        this.add.rectangle(W / 2, H / 2, W, H, 0xdaf5ff);
        this.add.rectangle(W / 2, 190, W, 220, 0xbcecff);
        this.add.rectangle(W / 2, this.floorY + 70, W, 210, 0x95c7d6);
        this.add.rectangle(W / 2, this.floorY + 12, W, 18, 0x5a96a8);

        // Toilet area (tank, seat, bowl, base).
        this.add.rectangle(220, 350, 110, 100, 0xf3f8fd).setStrokeStyle(4, 0x8bbfd8);
        this.add.rectangle(220, 400, 92, 46, 0xffffff).setStrokeStyle(2, 0x8bbfd8);
        this.add.ellipse(220, 448, 108, 44, 0xffffff).setStrokeStyle(3, 0x8bbfd8);
        this.add.ellipse(220, 448, 66, 24, 0xe8f3fb).setStrokeStyle(2, 0x9cc7dd);
        this.add.rectangle(220, 520, 90, 114, 0xf6fbff).setStrokeStyle(3, 0x8bbfd8);
        this.add.rectangle(248, 338, 12, 8, 0xb0c2d0);

        // Sink and soap area — croc faces toward mirror on wall.
        this.add.rectangle(620, 430, 240, 120, 0xbbe6ff).setStrokeStyle(4, 0xffffff);
        this.add.rectangle(620, 345, 240, 22, 0x78c4e1).setStrokeStyle(2, 0xffffff);
        // Brilliant soap dispenser (blue bottle with pump)
        this.add.rectangle(720, 396, 26, 52, 0x5abce8).setStrokeStyle(2, 0xffffff);
        this.add.rectangle(720, 368, 12, 18, 0x3a9fc8);
        this.add.ellipse(720, 360, 16, 8, 0x2a8fb8);
        this.add.text(720, 396, "SOAP", { fontSize: "9px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5);
        // Toothbrush
        this.add.rectangle(760, 386, 8, 46, 0xffe070).setStrokeStyle(2, 0xddb830);
        this.add.rectangle(760, 362, 16, 14, 0xfff7cc).setStrokeStyle(1, 0xddb830);
        for (let i = 0; i < 3; i++) {
            this.add.rectangle(756 + i * 4, 358, 2, 8, 0x88ddaa);
        }
        this.add.text(760, 414, "BRUSH", { fontSize: "9px", color: "#ddb830", fontStyle: "bold" }).setOrigin(0.5);
        // Mirror above sink (aligned centrally with sink bowl)
        this.mirrorFrame = this.add.rectangle(620, 266, 194, 132, 0xddf7ff).setStrokeStyle(5, 0x78c4e1);
        this.mirrorGlass = this.add.rectangle(620, 266, 184, 122, 0xeefaff, 0.8);
        // Mirror reflection shine
        this.add.rectangle(558, 230, 8, 40, 0xffffff, 0.5);
        this.add.text(620, 266, "MIRROR", { fontSize: "14px", color: "#2d6d85", fontStyle: "bold", stroke: "#ffffff", strokeThickness: 2 }).setOrigin(0.5);
        // Toothpaste tube placed below the mirror
        this.add.rectangle(684, 430, 22, 42, 0xffffff).setStrokeStyle(2, 0x9bb6ce);
        this.add.rectangle(684, 450, 18, 10, 0xe6f0ff).setStrokeStyle(1, 0x7f98af);
        this.add.triangle(684, 410, -8, 12, 8, 12, 0, -10, 0x55b1f0).setStrokeStyle(1, 0x3b88bf);
        this.add.text(684, 430, "PASTE", { fontSize: "8px", color: "#3b88bf", fontStyle: "bold" }).setOrigin(0.5);
        this.add.rectangle(620, 472, 16, 42, 0x8db2c9);
        this.add.ellipse(620, 454, 60, 20, 0xeef8ff).setStrokeStyle(2, 0x8db2c9);

        // Shower area — shower head CENTERED at x:1010.
        this.add.rectangle(1010, 378, 312, 270, 0xeaf9ff).setStrokeStyle(5, 0x8fcde0);
        this.add.rectangle(1010, 250, 250, 20, 0x9dcbe0).setStrokeStyle(2, 0xffffff);
        // Shower head pipe centered at x:1010
        this.add.rectangle(1010, 282, 70, 10, 0x6f8796).setDepth(6);
        this.add.rectangle(1010, 290, 6, 20, 0x7f97a6).setDepth(6);
        // Shower knobs
        this.add.circle(970, 302, 9, 0xff8080).setStrokeStyle(2, 0xffffff).setDepth(6);
        this.add.circle(1050, 302, 9, 0x8080ff).setStrokeStyle(2, 0xffffff).setDepth(6);
        // Shower floor drain
        this.add.circle(1010, 495, 14, 0xb0cad8).setStrokeStyle(2, 0x7a9cb0).setDepth(5);
        this.add.circle(1010, 495, 9, 0x8aacba).setDepth(5);

        this.add.text(W / 2, 52, "BATHROOM CARE", {
            fontSize: "48px", color: "#ffffff", fontStyle: "bold", stroke: "#2d6d85", strokeThickness: 5
        }).setOrigin(0.5);

        this.player = drawCroc(this, 180, this.floorY - 74, 0.78).setDepth(20);
        this.physics.add.existing(this.player);
        this.player.body.setAllowGravity(false);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(185, 78, true);

        this.keys = this.input.keyboard.addKeys({
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            e: Phaser.Input.Keyboard.KeyCodes.E,
            arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
            arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        });
        this.phoneControls = createPhoneControls(this, { e: true });

        this.statusText = this.add.text(24, 150, "Complete full hygiene routine: toilet, soap, wash, brush teeth, shower.", {
            fontSize: "22px", color: "#2d6d85", fontStyle: "bold"
        }).setScrollFactor(0);
        this.effectText = this.add.text(24, 185, "", {
            fontSize: "20px", color: "#3c6b3e", fontStyle: "bold"
        }).setScrollFactor(0);

        this.stations = [
            { id: "toilet", x: 220, prompt: "Use toilet and flush", cooldownUntil: 0 },
            { id: "soap", x: 760, prompt: "Apply soap first", cooldownUntil: 0 },
            { id: "paste", x: 684, prompt: "Apply toothpaste", cooldownUntil: 0 },
            { id: "sink", x: 620, prompt: "Wash face and hands", cooldownUntil: 0 },
            { id: "brush", x: 780, prompt: "Brush your teeth", cooldownUntil: 0 },
            { id: "shower", x: 1010, prompt: "Take a full shower", cooldownUntil: 0 },
        ];

        this.promptText = this.add.text(W / 2, H - 34, "Move near a bathroom station and press E", {
            fontSize: "20px", color: "#ffffff", fontStyle: "bold", stroke: "#2d6d85", strokeThickness: 3
        }).setOrigin(0.5);

        uiButton(this, W - 100, 44, 170, 52, "HOME", () => this.scene.start("HubScene"), 0xff7d7d, 0xff5858);
    }

    finishBathroomAction(effect, toastColor = "#fff6c5", releaseDelay = 1200) {
        this.effectText.setText(effect);
        addToast(this, effect, toastColor);
        this.time.delayedCall(releaseDelay, () => {
            this.playerBusy = false;
            setCrocExpression(this.player, "neutral");
        });
    }

    useStation(station) {
        if (this.playerBusy || this.time.now < station.cooldownUntil) return;
        this.playerBusy = true;
        station.cooldownUntil = this.time.now + 3800;
        this.player.body.setVelocityX(0);

        this.tweens.add({
            targets: this.player,
            x: station.x - 34,
            duration: 260,
            ease: "Quad.easeOut",
            onComplete: () => {
                if (station.id === "toilet") {
                    playSfx("flush", { volume: 0.3, rate: 1.0, durationMs: 1200, instanceKey: "bathroom-flush", replaceExisting: true });
                    setCrocExpression(this.player, "focused");
                    // Croc SITS on toilet seat — tween to seat position
                    this.tweens.add({
                        targets: this.player,
                        x: station.x + 12,
                        y: this.floorY - 142,
                        scaleY: 0.76,
                        duration: 280,
                        onComplete: () => {
                            // Tissue roll is taken from top tank, then used for wiping.
                            const tissueRoll = this.add.rectangle(station.x + 40, 338, 20, 18, 0xf5f8fb)
                                .setStrokeStyle(1, 0xb7c4d1).setDepth(41);
                            this.tweens.add({
                                targets: tissueRoll,
                                x: station.x + 54,
                                y: this.player.y + 16,
                                duration: 420,
                                onComplete: () => {
                                    tissueRoll.destroy();
                                }
                            });

                            // Tissue paper in hand — animated wipe motion
                            this.time.delayedCall(800, () => {
                                const tissue = this.add.rectangle(station.x + 54, this.player.y + 20, 22, 18,
                                    0xf5f8fb).setStrokeStyle(1, 0xb7c4d1).setDepth(41);
                                // Hand reaches forward and wipes
                                this.tweens.add({
                                    targets: tissue,
                                    x: station.x + 20,
                                    y: this.player.y + 34,
                                    duration: 350,
                                    yoyo: true,
                                    repeat: 4,
                                    onComplete: () => {
                                        this.tweens.add({ targets: tissue, alpha: 0, y: tissue.y - 30, duration: 400, onComplete: () => tissue.destroy() });
                                    }
                                });
                            });

                            const flushCore = this.add.circle(station.x, 512, 10, 0x8edbff, 0.9).setDepth(40);
                            this.tweens.add({
                                targets: flushCore,
                                scale: 4,
                                alpha: 0,
                                angle: 360,
                                duration: 1400,
                                delay: 1600,
                                onComplete: () => flushCore.destroy(),
                            });

                            const flushTxt = this.add.text(station.x, 456, "FLUSH", {
                                fontSize: "22px", color: "#1b6f93", fontStyle: "bold", stroke: "#ffffff", strokeThickness: 3
                            }).setOrigin(0.5).setDepth(45);
                            this.tweens.add({ targets: flushTxt, alpha: 0, y: 430, duration: 1500, delay: 1600, onComplete: () => flushTxt.destroy() });

                            // Stand back up after using toilet
                            this.time.delayedCall(2200, () => {
                                this.tweens.add({
                                    targets: this.player,
                                    x: station.x - 34,
                                    y: this.floorY - 74,
                                    scaleY: 1,
                                    angle: 0,
                                    duration: 280,
                                });
                            });
                        }
                    });

                    STATE.mood = Math.min(100, STATE.mood + 5);
                    STATE.energy = Math.min(100, STATE.energy + 3);
                    this.finishBathroomAction("Toilet done and flushed: mood +5, energy +3", "#fff6c5", 3200);
                    return;
                }

                if (station.id === "soap") {
                    playSfx("click", { volume: 0.24, rate: 1.25 });
                    this.soapLoaded = true;
                    for (let i = 0; i < 10; i++) {
                        const bubble = this.add.circle(station.x + Phaser.Math.Between(-14, 14), 390, Phaser.Math.Between(5, 9), 0xe8f5ff, 0.9).setDepth(40).setStrokeStyle(1, 0xaecfe3);
                        this.tweens.add({ targets: bubble, y: 340, alpha: 0, duration: 1050, delay: i * 85, onComplete: () => bubble.destroy() });
                    }
                    STATE.mood = Math.min(100, STATE.mood + 2);
                    this.finishBathroomAction("Soap applied. Now wash at sink for best hygiene.", "#dff8ff", 2000);
                    return;
                }

                if (station.id === "paste") {
                    playSfx("click", { volume: 0.24, rate: 1.12 });
                    this.toothpasteLoaded = true;
                    const faceScale = Math.abs(this.player.baseScale || 0.78);
                    const mouthX = this.player.x + (208 * faceScale);
                    const mouthY = this.player.y - (10 * faceScale);
                    const pasteBlob = this.add.circle(mouthX, mouthY, 8, 0xe7f6ff).setDepth(44).setStrokeStyle(1, 0x9fc8e0);
                    this.tweens.add({ targets: pasteBlob, y: pasteBlob.y - 8, alpha: 0, duration: 800, onComplete: () => pasteBlob.destroy() });
                    this.tweens.add({
                        targets: [this.mirrorFrame, this.mirrorGlass],
                        scaleX: 1.08,
                        scaleY: 1.08,
                        duration: 220,
                        yoyo: true,
                        onComplete: () => {
                            this.mirrorFrame.setScale(1, 1);
                            this.mirrorGlass.setScale(1, 1);
                        }
                    });
                    this.finishBathroomAction("Toothpaste applied. Now brush at the mirror.", "#dff8ff", 1700);
                    return;
                }

                if (station.id === "sink") {
                    playSfx("tap", { volume: 0.26, rate: 1.0, durationMs: 1200, instanceKey: "bathroom-sink", replaceExisting: true });
                    setCrocExpression(this.player, "happy");
                    // Croc faces and slightly rotates toward mirror.
                    setCrocFacing(this.player, 1);
                    this.player.setAngle(-8);
                    const handX = this.player.x + 78;
                    const handY = this.player.y + 16;
                    const soapStartX = 720;
                    const soapStartY = 392;
                    // Water goes to hand area.
                    for (let i = 0; i < 18; i++) {
                        const drop = this.add.rectangle(station.x + Phaser.Math.Between(-20, 20), 380, 3, 14, 0x78d7ff, 0.9).setDepth(40);
                        this.tweens.add({
                            targets: drop,
                            x: handX + Phaser.Math.Between(-12, 12),
                            y: handY + Phaser.Math.Between(-10, 10),
                            alpha: 0,
                            duration: 820,
                            delay: i * 60,
                            onComplete: () => drop.destroy()
                        });
                    }
                    // Soap bubbles on hand, not body.
                    for (let i = 0; i < 10; i++) {
                        const foam = this.add.circle(
                            handX + Phaser.Math.Between(-16, 16),
                            handY + Phaser.Math.Between(-12, 12),
                            Phaser.Math.Between(4, 8), 0xffffff, 0.88
                        ).setDepth(42).setStrokeStyle(1, 0xa8cce3);
                        this.tweens.add({ targets: foam, alpha: 0, y: foam.y - 18, duration: 760, delay: i * 80, onComplete: () => foam.destroy() });
                    }
                    // Soap scrubbing stroke on hand near sink mirror.
                    if (this.soapLoaded) {
                        const soapBottle = this.add.rectangle(soapStartX, soapStartY, 16, 34, 0x5abce8)
                            .setStrokeStyle(1, 0xffffff).setDepth(43);
                        const brush = this.add.rectangle(soapStartX - 18, soapStartY - 6, 8, 24, 0xffe070)
                            .setStrokeStyle(1, 0xddb830).setDepth(43);
                        this.tweens.add({
                            targets: soapBottle,
                            x: handX + 16,
                            y: handY - 10,
                            duration: 260,
                        });
                        this.tweens.add({ targets: brush, x: handX + 8, y: handY - 4, duration: 220 });
                        this.tweens.add({ targets: brush, y: handY - 14, duration: 120, delay: 240, yoyo: true, repeat: 8,
                            onComplete: () => brush.destroy() });
                        this.time.delayedCall(1500, () => {
                            if (soapBottle.active) soapBottle.destroy();
                        });
                    }

                    if (this.soapLoaded) {
                        this.soapLoaded = false;
                        STATE.stars += 2;
                        STATE.mood = Math.min(100, STATE.mood + 8);
                        this.finishBathroomAction("Hands washed with brilliant soap at mirror: stars +2, mood +8", "#fff6c5", 2600);
                    } else {
                        STATE.stars += 1;
                        STATE.mood = Math.min(100, STATE.mood + 4);
                        this.finishBathroomAction("Quick hand wash done: stars +1, mood +4", "#fff6c5", 2300);
                    }
                    this.time.delayedCall(900, () => this.player.setAngle(0));
                    return;
                }

                if (station.id === "brush") {
                    playSfx("toothbrush", { volume: 0.3, rate: 1.0, durationMs: 1500, instanceKey: "bathroom-toothbrush", replaceExisting: true });
                    // Brush teeth at mirror - teeth are part of croc mouth
                    setCrocExpression(this.player, "focused");
                    setCrocFacing(this.player, 1);
                    this.player.setAngle(-10);
                    this.player.x = 690;

                    // Toothbrush aligns with crocodile teeth at the snout.
                    const faceScale = Math.abs(this.player.baseScale || 0.78);
                    const brushX = this.player.x + (208 * faceScale);
                    const brushY = this.player.y - (14 * faceScale);
                    const toothbrush = this.add.rectangle(brushX, brushY, 8, 40, 0xffe070).setStrokeStyle(2, 0xddb830).setDepth(43);
                    const bristles = this.add.rectangle(brushX, brushY - 20, 12, 8, 0xfff7cc).setStrokeStyle(1, 0xddb830).setDepth(42);
                    
                    // Brushing motion - up and down on teeth
                    for (let i = 0; i < 10; i++) {
                        this.tweens.add({
                            targets: [toothbrush, bristles],
                            y: brushY - 10,
                            duration: 130,
                            yoyo: true,
                            delay: i * 140,
                        });
                    }
                    
                    // Foam/bubbles from brushing
                    this.time.delayedCall(520, () => {
                        for (let i = 0; i < 18; i++) {
                            const foam = this.add.circle(
                                brushX + Phaser.Math.Between(-8, 8),
                                brushY - Phaser.Math.Between(10, 20),
                                Phaser.Math.Between(3, 6), 0xffffff, 0.85
                            ).setDepth(41).setStrokeStyle(1, 0xc0e8ff);
                            this.tweens.add({ targets: foam, alpha: 0, y: foam.y - 15, duration: 900, delay: i * 70, onComplete: () => foam.destroy() });
                        }
                    });

                    if (this.toothpasteLoaded) {
                        this.tweens.add({
                            targets: [this.mirrorFrame, this.mirrorGlass],
                            scaleX: 1.1,
                            scaleY: 1.1,
                            duration: 180,
                            yoyo: true,
                            repeat: 2,
                            onComplete: () => {
                                this.mirrorFrame.setScale(1, 1);
                                this.mirrorGlass.setScale(1, 1);
                            }
                        });
                    }
                    
                    this.time.delayedCall(1600, () => {
                        toothbrush.destroy();
                        bristles.destroy();
                        this.player.setAngle(0);
                    });
                    
                    if (this.toothpasteLoaded) {
                        this.toothpasteLoaded = false;
                        STATE.mood = Math.min(100, STATE.mood + 8);
                        STATE.stars += 2;
                        this.finishBathroomAction("Teeth brushed efficiently with toothpaste! mood +8, stars +2", "#fff6c5", 2300);
                    } else {
                        STATE.mood = Math.min(100, STATE.mood + 5);
                        STATE.stars += 1;
                        this.finishBathroomAction("Teeth brushed. Apply toothpaste first for best results.", "#fff6c5", 2200);
                    }
                    return;
                }

                if (station.id === "shower") {
                    playSfx("shower", { volume: 0.32, rate: 1.0, durationMs: 1900, instanceKey: "bathroom-shower", replaceExisting: true });
                    setCrocExpression(this.player, "happy");
                    // Croc moves to center of shower box
                    this.tweens.add({
                        targets: this.player,
                        x: 1010,
                        duration: 260,
                        onComplete: () => {
                            // Drops fall exactly from shower head center.
                            for (let i = 0; i < 84; i++) {
                                const x = 1010 + Phaser.Math.Between(-48, 48);
                                const drop = this.add.rectangle(x, 295, 3, 18, 0x7ed7ff, 0.85).setDepth(40);
                                this.tweens.add({
                                    targets: drop,
                                    y: 500,
                                    alpha: 0,
                                    duration: 1700 + Phaser.Math.Between(-180, 200),
                                    delay: i * 36,
                                    onComplete: () => drop.destroy(),
                                });
                            }
                            // Water droplets hitting croc body
                            for (let i = 0; i < 26; i++) {
                                const splash = this.add.circle(
                                    1010 + Phaser.Math.Between(-64, 64),
                                    this.player.y + Phaser.Math.Between(-70, 28),
                                    Phaser.Math.Between(4, 9), 0xb8ecff, 0.75
                                ).setDepth(42);
                                this.tweens.add({ targets: splash, alpha: 0, y: splash.y + 16, duration: 760, delay: i * 70, onComplete: () => splash.destroy() });
                            }
                            for (let i = 0; i < 20; i++) {
                                const steam = this.add.circle(1010 + Phaser.Math.Between(-50, 50), 500, Phaser.Math.Between(6, 11), 0xf8ffff, 0.65).setDepth(41);
                                this.tweens.add({ targets: steam, y: 340, alpha: 0, duration: 1800, delay: i * 80, onComplete: () => steam.destroy() });
                            }
                            // Move croc back after shower
                            this.time.delayedCall(5200, () => {
                                this.tweens.add({ targets: this.player, x: station.x - 34, duration: 280 });
                            });
                        }
                    });

                    STATE.energy = Math.min(100, STATE.energy + 12);
                    STATE.mood = Math.min(100, STATE.mood + 10);
                    STATE.stars += 1;
                    // Longer shower duration: 5000ms
                    this.finishBathroomAction("Refreshing shower done: energy +12, mood +10, stars +1", "#fff6c5", 6200);
                }
            }
        });
    }

    update() {
        const nearest = this.stations.slice().sort((a, b) => Math.abs(this.player.x - a.x) - Math.abs(this.player.x - b.x))[0];
        const nearEnough = nearest && Math.abs(this.player.x - nearest.x) < 140;
        this.promptText.setText(nearEnough ? `Press E: ${nearest.prompt}` : "Move near a bathroom station and press E");

        if (!this.playerBusy) {
            let vx = 0;
            if (this.keys.left.isDown || this.keys.arrowLeft.isDown || this.phoneControls.isDown("left")) vx -= 220;
            if (this.keys.right.isDown || this.keys.arrowRight.isDown || this.phoneControls.isDown("right")) vx += 220;
            this.player.body.setVelocityX(vx);
            this.player.y = this.floorY - 74;
            if (vx > 8) {
                setCrocFacing(this.player, 1);
                setCrocExpression(this.player, "neutral");
            } else if (vx < -8) {
                setCrocFacing(this.player, -1);
                setCrocExpression(this.player, "focused");
            }
        } else {
            this.player.body.setVelocityX(0);
        }

        if ((Phaser.Input.Keyboard.JustDown(this.keys.e) || this.phoneControls.consume("e")) && nearEnough) {
            this.useStation(nearest);
        }
    }
}
class TVScene extends Phaser.Scene {
    constructor() {
        super("TVScene");
    }

    create() {
        setSceneMusic("background");
        this.floorY = 590;
        this.playerSpeed = 240;
        this.isSitting = true;
        this.currentZone = "Sofa";

        this.add.rectangle(W / 2, H / 2, W, H, 0x3f4f83);
        this.add.rectangle(W / 2, 170, W, 220, 0x51629e);
        this.add.rectangle(W / 2, 640, W, 256, 0x28345e);
        this.add.rectangle(W / 2, this.floorY + 50, W, 18, 0x5b647f);

        this.add.text(W / 2, 64, "CROC TV TIME", {
            fontSize: "52px",
            color: "#ffffff",
            fontStyle: "bold",
        }).setOrigin(0.5);

        const sofaBase = this.add.rectangle(270, 578, 300, 86, 0x8f5848).setStrokeStyle(4, 0x6f3e33);
        const sofaBack = this.add.rectangle(270, 520, 310, 84, 0x9b6352).setStrokeStyle(4, 0x6f3e33);
        const armLeft = this.add.rectangle(130, 568, 42, 92, 0x7f4d3f).setStrokeStyle(3, 0x6a3f34);
        const armRight = this.add.rectangle(410, 568, 42, 92, 0x7f4d3f).setStrokeStyle(3, 0x6a3f34);
        const seatL = this.add.rectangle(214, 572, 98, 54, 0xa86d5a).setStrokeStyle(2, 0x7f4d3f);
        const seatR = this.add.rectangle(326, 572, 98, 54, 0xa86d5a).setStrokeStyle(2, 0x7f4d3f);
        const pillowL = this.add.rectangle(218, 532, 72, 46, 0xc48672).setStrokeStyle(2, 0x8f5848);
        const pillowR = this.add.rectangle(322, 532, 72, 46, 0xc48672).setStrokeStyle(2, 0x8f5848);
        this.sofa = this.add.container(0, 0, [sofaBase, sofaBack, armLeft, armRight, seatL, seatR, pillowL, pillowR]);

        // Beautiful floor lamp next to sofa - stand connects firmly to shade
        // Beautiful floor lamp next to sofa
            const lampBase = this.add.ellipse(480, 624, 50, 14, 0x3a3a3a);
            const lampStand = this.add.rectangle(480, 558, 14, 144, 0x8b7355).setStrokeStyle(2, 0x654321);

            // --- CHANGED AREA ---
            // 1. lampNeck: Moved X to 482 (right) and Y to 492 (down)
            const lampNeck = this.add.rectangle(500, 492, 22, 12, 0x9b8455).setStrokeStyle(1, 0x654321);

            // 2. lampShade: Moved X to 482 (right) and Y to 492 (down) to match neck
            const lampShade = this.add.polygon(520, 510, [
                { x: -36, y: 0 },
                { x: 36, y: 0 },
                { x: 26, y: -52 },
                { x: -26, y: -52 }
            ], 0xffd700).setStrokeStyle(2, 0xdaa520);

            // 3. lampGlow: Moved X to 482 and Y to 468 (down) so the light comes from the new shade position
            const lampGlow = this.add.circle(482, 457, 28, 0xffffe0, 0.28);
            // --- END CHANGED AREA ---

            this.tweens.add({
                targets: lampGlow,
                alpha: 0.15,
                duration: 2000,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

        this.tvStand = this.add.rectangle(900, 520, 360, 40, 0x2d3a48).setStrokeStyle(3, 0x6f7c8e);
        this.soundbar = this.add.rectangle(900, 500, 190, 14, 0x111820).setStrokeStyle(1, 0x5f738a);

        const screenFrame = this.add.rectangle(900, 330, 430, 280, 0x1d1f24).setStrokeStyle(8, 0x6f7680);
        this.screen = this.add.rectangle(900, 330, 382, 230, 0x000000);
        
        // TV screen content graphics container
        this.screenContent = this.add.container(900, 330).setDepth(1);
        const screenMask = this.screen.createGeometryMask();
        // This tells the container to stay inside that shape
        this.screenContent.setMask(screenMask);

        this.isPowered = true; // TV starts on

        this.player = drawCroc(this, 320, this.floorY - 72, 0.72).setDepth(20);
        this.physics.add.existing(this.player);
        this.player.body.setAllowGravity(false);
        this.player.body.setSize(176, 78, true);
        this.player.body.setCollideWorldBounds(true);

        this.channels = [
            { name: "Nature 4K", color: 0x4fb26b, visual: "nature" },
            { name: "Global Sports", color: 0xe8943f, visual: "football" },
            { name: "Kids Cartoon", color: 0x63b0f7, visual: "cartoon" },
            { name: "Discovery Lab", color: 0x9c83f8, visual: "science" },
            { name: "News 24", color: 0xd66d75, visual: "news" },
            { name: "Music Mix", color: 0x4fc4d4, visual: "music" },
        ];

        this.channelIndex = 0;

       this.channelBadge = this.add.text(900, 220, "", {
    fontSize: "20px",
    color: "#ffffff",
    backgroundColor: "#1f2f4a",
    padding: { x: 10, y: 6 },
    fontStyle: "bold"
}).setOrigin(0.5).setDepth(100);
        
        this.powerIndicator = this.add.circle(780, 460, 8, 0x00ff00).setDepth(12);

        this.tvStatusText = this.add.text(24, 145, "Zone: Sofa", {
            fontSize: "22px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 3,
        });

        this.instructionText = this.add.text(W / 2, H - 32, "Walk to TV, press E to toggle power, C to change channels.", {
            fontSize: "18px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 3,
        }).setOrigin(0.5);

        const applyChannel = () => {
            if (!this.isPowered) {
                this.screen.setFillStyle(0x000000);
                this.screenContent.removeAll(true);
                this.channelBadge.setText("TV OFF");
                this.powerIndicator.setFillStyle(0xff0000);
                return;
            }
            
            this.powerIndicator.setFillStyle(0x00ff00);
            const ch = this.channels[this.channelIndex];
            this.screen.setFillStyle(ch.color);
            this.channelBadge.setText(`ON AIR: ${ch.name}`);
            
            // Clear previous content
            this.screenContent.removeAll(true);
            
            // Draw visual content based on channel type
            if (ch.visual === "football") {
                // Football field with better realism
                const field = this.add.rectangle(0, 20, 360, 160, 0x2d7a2d);
                const grass = this.add.rectangle(0, 60, 360, 100, 0x4a9d4f);
                const centerLine = this.add.rectangle(0, 40, 4, 140, 0xffffff);
                const centerCircle = this.add.circle(0, 40, 30, 0x2d7a2d).setStrokeStyle(2, 0xffffff);
                const goal = this.add.rectangle(-165, 40, 8, 60, 0xffffff);
                const goal2 = this.add.rectangle(165, 40, 8, 60, 0xffffff);
                const ball = this.add.circle(20, 25, 8, 0xffffff);
                const player1 = this.add.text(-80, 35, "⚽", { fontSize: "28px" });
                const player2 = this.add.text(60, 20, "🐊", { fontSize: "24px" });
                const crowd = this.add.text(-118, -70, "LIVE MATCH", { fontSize: "14px", color: "#ffff00", fontStyle: "bold" });
                this.screenContent.add([field, grass, centerLine, centerCircle, goal, goal2, ball, player1, player2, crowd]);
                // Animate ball
                this.tweens.add({
                    targets: ball,
                    x: 80,
                    y: -10,
                    duration: 2000,
                    yoyo: true,
                    repeat: -1,
                });
            } else if (ch.visual === "news") {
                // News broadcast with better layout - text stays within bounds
                const newsDesk = this.add.rectangle(0, 50, 340, 100, 0x2c3e50);
                const newsBackground = this.add.rectangle(0, -70, 360, 40, 0xcc0000);
                const headline = this.add.text(0, -70, "BREAKING NEWS", { 
                    fontSize: "14px", 
                    color: "#ffffff", 
                    fontStyle: "bold"
                }).setOrigin(0.5);
                const anchor = this.add.text(-80, 30, "🦁", { fontSize: "40px" });
                const desk = this.add.rectangle(-30, 60, 80, 50, 0x4a4a4a).setStrokeStyle(2, 0x8a8a8a);
                const notepad = this.add.rectangle(-25, 48, 40, 30, 0xffffff).setStrokeStyle(1, 0x333333);
                const ticker = this.add.rectangle(0, 105, 360, 18, 0x1a1a1a);
                const tickerText = this.add.text(0, 105, "Markets up | Sunny weather | Sports tonight", {
                    fontSize: "9px",
                    color: "#ffff00",
                    wordWrap: { width: 320 },
                    align: "center"
                }).setOrigin(0.5);
                this.screenContent.add([newsBackground, headline, newsDesk, anchor, desk, notepad, ticker, tickerText]);
                // Keep ticker fully inside TV border.
            } else if (ch.visual === "science") {
                // Lab equipment - improved
                const labBench = this.add.rectangle(0, 60, 340, 80, 0x7f8c8d).setStrokeStyle(2, 0x5a6a75);
                const beaker1 = this.add.ellipse(-100, 40, 28, 38, 0x66ccff).setStrokeStyle(3, 0xffffff);
                const liquid1 = this.add.ellipse(-100, 50, 24, 18, 0x0099ff);
                const beaker2 = this.add.ellipse(-20, 45, 24, 34, 0xff6b9d).setStrokeStyle(3, 0xffffff);
                const liquid2 = this.add.ellipse(-20, 55, 20, 14, 0xff1493);
                const flask = this.add.ellipse(60, 50, 25, 36, 0x66dd66).setStrokeStyle(3, 0xffffff);
                const flaskNeck = this.add.rectangle(60, 28, 8, 14, 0x666666);
                const microscope = this.add.text(130, 40, "🔬", { fontSize: "36px" });
                const title = this.add.text(0, -70, "🧪 DISCOVERY LAB 🧪", { fontSize: "16px", color: "#ffffff", fontStyle: "bold" });
                const atoms = this.add.text(-140, -50, "⚛️", { fontSize: "32px" });
                this.screenContent.add([labBench, beaker1, liquid1, beaker2, liquid2, flask, flaskNeck, microscope, title, atoms]);
                // Rotate atoms
                this.tweens.add({
                    targets: atoms,
                    angle: 360,
                    duration: 3000,
                    repeat: -1,
                });
            } else if (ch.visual === "nature") {
                // Nature scene - improved
                const sky = this.add.rectangle(0, -50, 360, 100, 0x87ceeb);
                const grass = this.add.rectangle(0, 70, 360, 100, 0x5d8c3f);
                const sun = this.add.circle(120, -60, 25, 0xffd700).setStrokeStyle(2, 0xffaa00);
                const tree1 = this.add.text(-120, 20, "🌳", { fontSize: "56px" });
                const tree2 = this.add.text(60, 15, "🌲", { fontSize: "48px" });
                const flower = this.add.text(0, 50, "🌻", { fontSize: "32px" });
                const river = this.add.ellipse(0, 85, 120, 28, 0x4fb4d8).setStrokeStyle(2, 0x87ceeb);
                const bird = this.add.text(-160, -60, "🦅", { fontSize: "32px" });
                this.screenContent.add([sky, grass, sun, tree1, tree2, flower, river, bird]);
                // Animate bird flying forward only (no backwards)
                this.tweens.add({
                    targets: bird,
                    x: 180,
                    y: -65,
                    duration: 5000,
                    repeat: -1,
                    onRepeat: () => {
                        bird.x = -160;
                        bird.y = -60;
                    }
                });
            } else if (ch.visual === "cartoon") {
    // 1. Background (sized to fit the 382x230 screen)
    const cartoonBg = this.add.rectangle(0, 0, 382, 230, 0x75c2ff);
    
    // 2. Mountains (Adjusted Y so they don't poke out the top)
    const mountainLeft = this.add.triangle(-84, 50, -100, 80, 0, 80, -50, -10, 0x8e7754).setStrokeStyle(1, 0x6b593e);
    const mountainRight = this.add.triangle(48, 55, -50, 80, 100, 80, 25, -20, 0x7c6848).setStrokeStyle(1, 0x5f4f36);
    
    // 3. Ground (Lowered to the bottom of the screen)
    const grass = this.add.rectangle(0, 85, 382, 60, 0x62b64f);

    // 4. House & Decorations
    const house = this.add.rectangle(-110, 60, 56, 38, 0xf4c27a).setStrokeStyle(2, 0x9b6a39);
    const roof = this.add.triangle(-110, 42, -146, 56, -74, 56, -110, 18, 0xb04632).setStrokeStyle(2, 0x8b3a1f);
    const treeTrunk = this.add.rectangle(135, 73, 12, 36, 0x8b4513);
    const treeLeaves = this.add.circle(135, 54, 20, 0x2f9d47);
    
    // 5. The Car (The emoji only - no extra rectangles to cause "squares")
    const car = this.add.text(-220, 75, "🚗", { fontSize: "32px" });

    // 6. Animation (Looping across the screen)
    this.tweens.add({
        targets: car,
        x: 220,
        duration: 4000,
        repeat: -1,
        onRepeat: () => { car.x = -220; } 
    });

    // 7. Add everything to the container
    this.screenContent.add([
        cartoonBg, mountainLeft, mountainRight, grass, 
        house, roof, treeTrunk, treeLeaves, car
    ]);
}
             else if (ch.visual === "music") {
                // Music concert - improved
                const background = this.add.rectangle(0, 0, 360, 200, 0x1a1a2e);
                const stageLight = this.add.rectangle(0, -90, 360, 20, 0x222233);
                const stage = this.add.rectangle(0, 70, 340, 90, 0x2c2c2c).setStrokeStyle(3, 0x555555);
                const lights1 = this.add.circle(-140, -80, 18, 0xffff00, 0.85);
                const lights2 = this.add.circle(140, -80, 18, 0xff00ff, 0.85);
                const lights3 = this.add.circle(-70, -85, 14, 0x00ffff, 0.85);
                const lights4 = this.add.circle(70, -85, 14, 0x00ff00, 0.85);
                const singer = this.add.text(-20, 45, "🎤", { fontSize: "44px" });
                const guitarist = this.add.text(80, 50, "🎸", { fontSize: "40px" });
                const drummer = this.add.text(-100, 55, "🥁", { fontSize: "36px" });
                const notes = this.add.text(0, -30, "♪ ♫ ♪", { fontSize: "28px", color: "#00ff00", fontStyle: "bold" });
                const crowd = this.add.text(-120, 105, "🎉 LIVE 🎉", { fontSize: "14px", color: "#ffff00", fontStyle: "bold" });
                this.screenContent.add([background, stageLight, stage, lights1, lights2, lights3, lights4, singer, guitarist, drummer, notes, crowd]);
                // Pulse lights
                this.tweens.add({
                    targets: [lights1, lights2, lights3, lights4],
                    alpha: 0.2,
                    duration: 400,
                    yoyo: true,
                    repeat: -1,
                });
            }

            this.tweens.add({
                targets: [this.screen, this.screenContent],
                alpha: { from: 0.45, to: 1 },
                duration: 180,
            });
        };
        applyChannel();

        const nextChannelBtn = uiButton(this, 1005, 580, 150, 64, "NEXT CH", () => {
            if (!this.isPowered) {
                this.instructionText.setText("TV is off! Press E near TV to turn it on first.");
                return;
            }
            playSfx("click", { volume: 0.22, rate: 1.12 });
            this.channelIndex = (this.channelIndex + 1) % this.channels.length;
            applyChannel();
            STATE.mood = Math.min(100, STATE.mood + 2);
        }, 0x7d8cff, 0x5f6ff5);
        nextChannelBtn.label.setFontSize("18px");
        
        const powerBtn = uiButton(this, 820, 580, 150, 64, "POWER", () => {
            this.isPowered = !this.isPowered;
            playSfx(this.isPowered ? "tvOn" : "tvOff", { volume: 0.4, rate: 1.0 });
            applyChannel();
            const msg = this.add.text(900, 460, this.isPowered ? "TV ON" : "TV OFF", {
                fontSize: "24px",
                color: "#ffffff",
                backgroundColor: this.isPowered ? "#00aa00" : "#aa0000",
                padding: { x: 12, y: 6 },
                fontStyle: "bold"
            }).setOrigin(0.5);
            this.tweens.add({ 
                targets: msg, 
                alpha: 0, 
                y: 440, 
                duration: 1200, 
                onComplete: () => msg.destroy() 
            });
        }, 0x58b56e, 0x3c9b56);
        powerBtn.label.setFontSize("20px");

        this.keys = this.input.keyboard.addKeys({
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            e: Phaser.Input.Keyboard.KeyCodes.E,
            c: Phaser.Input.Keyboard.KeyCodes.C,
            arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
            arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        });
        this.phoneControls = createPhoneControls(this, { e: true, c: true });

        this.applyTVChannel = applyChannel;

        uiButton(this, W - 100, 44, 170, 52, "HOME", () => this.scene.start("HubScene"), 0xff7d7d, 0xff5858);
    }

    update() {
        let vx = 0;
        if (!this.isSitting) {
            if (this.keys.left.isDown || this.keys.arrowLeft.isDown || this.phoneControls.isDown("left")) vx -= this.playerSpeed;
            if (this.keys.right.isDown || this.keys.arrowRight.isDown || this.phoneControls.isDown("right")) vx += this.playerSpeed;
        }

        this.player.body.setVelocityX(vx);
        this.player.y = this.floorY - 72;

        if (vx > 8) {
            setCrocFacing(this.player, 1);
            setCrocExpression(this.player, "neutral");
        } else if (vx < -8) {
            setCrocFacing(this.player, -1);
            setCrocExpression(this.player, "focused");
        }

        const nearTV = Math.abs(this.player.x - 900) < 180;
        const nearSofa = Math.abs(this.player.x - 300) < 180;
        this.currentZone = nearTV ? "TV" : nearSofa ? "Sofa" : "Living Room";
        this.tvStatusText.setText(`Zone: ${this.currentZone}`);

        if (Phaser.Input.Keyboard.JustDown(this.keys.e) || this.phoneControls.consume("e")) {
            if (this.currentZone === "TV") {
                // Toggle power when near TV
                this.isPowered = !this.isPowered;
                playSfx(this.isPowered ? "tvOn" : "tvOff", { volume: 0.4, rate: 1.0 });
                this.applyTVChannel();
                this.instructionText.setText(`TV ${this.isPowered ? 'ON' : 'OFF'}. Press C to change channels.`);
            } else if (this.currentZone === "Sofa") {
                this.isSitting = !this.isSitting;
                this.statusHint = this.isSitting ? "Sitting on sofa" : "Standing up";
                this.player.x = this.isSitting ? 320 : 380;
                this.player.body.setVelocityX(0);
                setCrocExpression(this.player, this.isSitting ? "happy" : "neutral");
                this.instructionText.setText(`${this.statusHint}. Walk to TV and press E to toggle power.`);
            }
        }
        
        if ((Phaser.Input.Keyboard.JustDown(this.keys.c) || this.phoneControls.consume("c")) && nearTV) {
            if (!this.isPowered) {
                this.instructionText.setText("TV is off! Press E to turn it on first.");
            } else {
                playSfx("click", { volume: 0.22, rate: 1.12 });
                this.channelIndex = (this.channelIndex + 1) % this.channels.length;
                this.applyTVChannel();
                STATE.mood = Math.min(100, STATE.mood + 1);
                this.instructionText.setText(`Switched to ${this.channels[this.channelIndex].name}`);
            }
        }
    }
}

class MuseumScene extends Phaser.Scene {
    constructor() {
        super("MuseumScene");
    }

    create() {
        setSceneMusic("museum");
        this.worldWidth = 4200;
        this.floorY = 620;
        this.playerBusy = false;

        // Atmospheric museum hall with grand entrance.
        this.add.rectangle(this.worldWidth / 2, H / 2, this.worldWidth, H, 0xeef2f7);
        this.add.rectangle(this.worldWidth / 2, 188, this.worldWidth, 260, 0xd9e4f1);
        this.add.rectangle(this.worldWidth / 2, this.floorY + 70, this.worldWidth, 210, 0xa49786);
        this.add.rectangle(this.worldWidth / 2, this.floorY + 12, this.worldWidth, 18, 0x6f6354);

        // Grand entry arch and doors.
        this.add.rectangle(W / 2, 170, 680, 250, 0xf6f8fb).setStrokeStyle(6, 0xa9bdd2);
        this.add.ellipse(W / 2, 88, 380, 120, 0xf6f8fb).setStrokeStyle(6, 0xa9bdd2);
        this.add.rectangle(W / 2 - 90, 238, 110, 160, 0x6f4f37).setStrokeStyle(3, 0xd8bf9c);
        this.add.rectangle(W / 2 + 90, 238, 110, 160, 0x6f4f37).setStrokeStyle(3, 0xd8bf9c);
        this.add.circle(W / 2 - 50, 238, 5, 0xe3cfb5);
        this.add.circle(W / 2 + 50, 238, 5, 0xe3cfb5);

        // Wall columns and frames.
        for (let i = 0; i < 18; i++) {
            const x = 80 + i * 224;
            this.add.rectangle(x, 360, 84, 330, 0xf8fbff).setStrokeStyle(3, 0xbbcde0);
            this.add.rectangle(x, 210, 90, 16, 0xbbcde0);
        }

        // Paintings on walls.
        const addPainting = (x, y, title, bg, accent) => {
            this.add.rectangle(x, y, 140, 92, 0x6d4d2f).setStrokeStyle(3, 0xe8d2b5);
            this.add.rectangle(x, y, 124, 76, bg).setStrokeStyle(1, 0xffffff, 0.5);
            this.add.circle(x - 34, y - 12, 10, accent, 0.9);
            this.add.ellipse(x + 18, y + 8, 50, 24, 0xffffff, 0.15);
            this.add.text(x, y + 52, title, { fontSize: "11px", color: "#3f2d1d", fontStyle: "bold" }).setOrigin(0.5);
        };
        addPainting(180, 260, "River Dawn", 0x6aa9d9, 0xffd56b);
        addPainting(420, 260, "Lost Fortress", 0x70849a, 0xc4cfd8);
        addPainting(860, 260, "Jungle Kings", 0x68a86b, 0xf0e1a8);
        addPainting(1100, 260, "Golden Era", 0xb58354, 0xffe299);

        // Heritage exhibits with more realistic display composition.
        this.add.rectangle(260, 540, 170, 28, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf);
        this.add.rectangle(260, 494, 56, 66, 0xd2c4ad).setStrokeStyle(2, 0x8f7a5e);
        this.add.ellipse(260, 472, 58, 20, 0xba986f).setStrokeStyle(2, 0x8a6b45);
        this.add.ellipse(260, 450, 30, 28, 0xc8ad86).setStrokeStyle(2, 0x8a6b45);
        this.add.text(260, 570, "Ancient Pottery", { fontSize: "15px", color: "#3f2d1d", fontStyle: "bold" }).setOrigin(0.5);

        this.add.rectangle(520, 540, 170, 28, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf);
        this.add.rectangle(520, 492, 44, 74, 0x8f9aaa).setStrokeStyle(2, 0xc8d2df);
        this.add.circle(520, 454, 20, 0x9da7b4).setStrokeStyle(2, 0xc8d2df);
        this.add.rectangle(520, 472, 10, 22, 0x7f8895);
        this.add.text(520, 570, "Stone Guardian", { fontSize: "15px", color: "#3f2d1d", fontStyle: "bold" }).setOrigin(0.5);

        this.add.rectangle(780, 540, 170, 28, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf);
        this.add.rectangle(780, 496, 8, 68, 0xc8d3df).setStrokeStyle(1, 0xffffff, 0.5);
        this.add.polygon(780, 452, [{x:-8,y:0},{x:8,y:0},{x:0,y:-34}], 0xd9e6f5).setStrokeStyle(2, 0xffffff, 0.6);
        this.add.rectangle(780, 498, 26, 10, 0x5f4732).setStrokeStyle(1, 0xd1b695);
        this.add.text(780, 570, "Royal Blade", { fontSize: "15px", color: "#3f2d1d", fontStyle: "bold" }).setOrigin(0.5);

        // New heritage displays: skulls, fossils, and ancient bones.
        this.add.rectangle(950, 540, 170, 28, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf);
        this.add.ellipse(950, 468, 62, 44, 0xd8ccb8).setStrokeStyle(2, 0x8f7a5e);
        this.add.circle(934, 464, 7, 0x5f5347);
        this.add.circle(966, 464, 7, 0x5f5347);
        this.add.rectangle(950, 484, 18, 8, 0xbba88f).setStrokeStyle(1, 0x8f7a5e);
        this.add.text(950, 570, "Ancient Skull", { fontSize: "15px", color: "#3f2d1d", fontStyle: "bold" }).setOrigin(0.5);

        this.add.rectangle(1120, 540, 170, 28, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf);
        this.add.ellipse(1120, 470, 86, 30, 0xc8b9a2).setStrokeStyle(2, 0x8f7a5e);
        this.add.ellipse(1086, 470, 24, 14, 0xd8ccb8).setStrokeStyle(2, 0x8f7a5e);
        this.add.ellipse(1154, 470, 24, 14, 0xd8ccb8).setStrokeStyle(2, 0x8f7a5e);
        this.add.rectangle(1120, 455, 10, 28, 0xbba88f).setStrokeStyle(1, 0x8f7a5e);
        this.add.text(1120, 570, "Fossil Bones", { fontSize: "15px", color: "#3f2d1d", fontStyle: "bold" }).setOrigin(0.5);

        this.add.rectangle(1540, 540, 170, 28, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf);
        this.add.rectangle(1540, 488, 62, 74, 0xb5a58f).setStrokeStyle(2, 0x8f7a5e);
        this.add.rectangle(1514, 452, 18, 24, 0xc7b7a1).setStrokeStyle(1, 0x8f7a5e);
        this.add.rectangle(1566, 452, 18, 24, 0xc7b7a1).setStrokeStyle(1, 0x8f7a5e);
        this.add.text(1540, 570, "Ancient Stone Tablet", { fontSize: "15px", color: "#3f2d1d", fontStyle: "bold" }).setOrigin(0.5);

        this.add.rectangle(1800, 540, 170, 28, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf);
        this.add.ellipse(1800, 470, 72, 46, 0xc8bcab).setStrokeStyle(2, 0x8f7a5e);
        this.add.circle(1800, 470, 16, 0xe0d6c6).setStrokeStyle(1, 0x8f7a5e);
        this.add.text(1800, 570, "Fossil Egg", { fontSize: "15px", color: "#3f2d1d", fontStyle: "bold" }).setOrigin(0.5);

        this.add.rectangle(2060, 540, 170, 28, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf);
        this.add.rectangle(2060, 490, 24, 82, 0xbda889).setStrokeStyle(2, 0x8f7a5e);
        this.add.triangle(2060, 446, -18, 10, 18, 10, 0, -22, 0xd8c7aa).setStrokeStyle(1, 0x8f7a5e);
        this.add.text(2060, 570, "Rune Obelisk", { fontSize: "15px", color: "#3f2d1d", fontStyle: "bold" }).setOrigin(0.5);

        // Tour guide area.
        this.add.rectangle(1230, 555, 190, 44, 0x8f633f).setStrokeStyle(3, 0xdcc3a8);
        this.add.rectangle(1230, 532, 170, 16, 0x7f5838);
        this.tourGuide = drawPanda(this, 1230, this.floorY - 94, 0.62).setDepth(12);
        this.add.text(1230, 446, "TOUR GUIDE", {
            fontSize: "20px", color: "#fff7df", fontStyle: "bold", stroke: "#4a3322", strokeThickness: 3
        }).setOrigin(0.5);

        // Visitors with moving bodies and legs + selfies.
        const makeVisitor = (x, tint, delay) => {
            const body = this.add.ellipse(x, this.floorY - 78, 54, 52, tint).setDepth(9);
            const head = this.add.circle(x + 18, this.floorY - 108, 16, tint).setDepth(10);
            const legL = this.add.rectangle(x - 10, this.floorY - 44, 8, 24, 0x473b31).setDepth(8);
            const legR = this.add.rectangle(x + 8, this.floorY - 44, 8, 24, 0x473b31).setDepth(8);
            const phone = this.add.rectangle(x + 28, this.floorY - 96, 10, 16, 0x2f3a48).setDepth(11);
            this.tweens.add({ targets: [body, head], y: '-=6', duration: 700, yoyo: true, repeat: -1, delay });
            this.tweens.add({ targets: legL, angle: 16, duration: 280, yoyo: true, repeat: -1, delay });
            this.tweens.add({ targets: legR, angle: -16, duration: 280, yoyo: true, repeat: -1, delay: delay + 120 });
            this.tweens.add({ targets: phone, angle: -20, duration: 260, yoyo: true, repeat: -1, delay });
            this.time.addEvent({
                delay: 1300 + delay,
                loop: true,
                callback: () => {
                    const flash = this.add.circle(phone.x + 6, phone.y - 4, 8, 0xffffff, 0.75).setDepth(20);
                    this.tweens.add({ targets: flash, alpha: 0, scale: 2.2, duration: 180, onComplete: () => flash.destroy() });
                }
            });
        };
        makeVisitor(340, 0x8fd2a1, 0);
        makeVisitor(620, 0x8db4e8, 180);
        makeVisitor(900, 0xe0b987, 320);
        makeVisitor(1120, 0xc6a5df, 470);

        // Header and subtitle separated so they never overlap.
        this.add.text(W / 2, 40, "HERITAGE MUSEUM", {
            fontSize: "52px", color: "#ffffff", fontStyle: "bold", stroke: "#39506c", strokeThickness: 6
        }).setOrigin(0.5).setScrollFactor(0);

        this.player = drawCroc(this, 150, this.floorY - 74, 0.76).setDepth(20);
        this.physics.add.existing(this.player);
        this.player.body.setAllowGravity(false);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(185, 78, true);
        this.physics.world.setBounds(0, 0, this.worldWidth, H);
        this.cameras.main.setBounds(0, 0, this.worldWidth, H);
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -W * 0.22, 20);

        this.keys = this.input.keyboard.addKeys({
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
            e: Phaser.Input.Keyboard.KeyCodes.E,
            arrowLeft: Phaser.Input.Keyboard.KeyCodes.LEFT,
            arrowRight: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        });
        this.phoneControls = createPhoneControls(this, { e: true });

        this.statusText = this.add.text(24, 150, "Visit exhibits and ask the guide for historical context.", {
            fontSize: "21px", color: "#39506c", fontStyle: "bold"
        }).setScrollFactor(0);
        this.effectText = this.add.text(24, 185, "", {
            fontSize: "19px", color: "#3c6b3e", fontStyle: "bold"
        }).setScrollFactor(0);

        this.stations = [
            { id: "pottery", x: 260, prompt: "Examine Ancient Pottery", cooldownUntil: 0 },
            { id: "guardian", x: 520, prompt: "Examine Stone Guardian", cooldownUntil: 0 },
            { id: "blade", x: 780, prompt: "Examine Royal Blade", cooldownUntil: 0 },
            { id: "skull", x: 950, prompt: "Examine Ancient Skull", cooldownUntil: 0 },
            { id: "bones", x: 1120, prompt: "Examine Fossil Bones", cooldownUntil: 0 },
            { id: "tablet", x: 1540, prompt: "Examine Stone Tablet", cooldownUntil: 0 },
            { id: "egg", x: 1800, prompt: "Examine Fossil Egg", cooldownUntil: 0 },
            { id: "obelisk", x: 2060, prompt: "Examine Rune Obelisk", cooldownUntil: 0 },
            { id: "guide", x: 1230, prompt: "Ask tour guide", cooldownUntil: 0 },
        ];

        this.promptText = this.add.text(W / 2, H - 34, "Move near an exhibit and press E", {
            fontSize: "20px", color: "#ffffff", fontStyle: "bold", stroke: "#39506c", strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0);

        const homeBtn = uiButton(this, W - 100, 44, 170, 52, "HOME", () => this.scene.start("HubScene"), 0xff7d7d, 0xff5858);
        homeBtn.btn.setScrollFactor(0);
        homeBtn.label.setScrollFactor(0);
    }

    useStation(station) {
        if (this.playerBusy || this.time.now < station.cooldownUntil) return;
        this.playerBusy = true;
        station.cooldownUntil = this.time.now + 1800;

        this.tweens.add({
            targets: this.player,
            x: station.x - 34,
            duration: 260,
            ease: "Quad.easeOut",
            onComplete: () => {
                if (station.id === "guide") {
                    // Interactive tour guide dialog system
                    this.showGuideDialog();
                    return;
                }

                const names = {
                    pottery: "Ancient Pottery",
                    guardian: "Stone Guardian",
                    blade: "Royal Blade",
                    skull: "Ancient Skull",
                    bones: "Fossil Bones",
                    tablet: "Ancient Stone Tablet",
                    egg: "Fossil Egg",
                    obelisk: "Rune Obelisk",
                };
                const lore = {
                    pottery: "Used for sacred river rituals over 2,000 years ago.",
                    guardian: "A carved protector statue from a lost fortress gate.",
                    blade: "A ceremonial sword carried by crocodile kings.",
                    skull: "A preserved skull from an early river civilization burial site.",
                    bones: "Fossilized bones from prehistoric wetland reptiles.",
                    tablet: "Stone records of old trade routes and royal decrees.",
                    egg: "A giant fossil egg from a now-extinct marsh species.",
                    obelisk: "A sacred marker engraved with river-runic symbols.",
                };
                // After reading about an exhibit, sit and read naturally for a moment.
                this.time.delayedCall(600, () => {
                    this.sitAndReadBook(station.id, names[station.id]);
                });

                STATE.stars += 2;
                STATE.coins += 5;
                STATE.mood = Math.min(100, STATE.mood + 5);
                const effect = `${names[station.id]} discovered. ${lore[station.id]} (+2 stars, +5 coins)`;
                this.effectText.setText(effect);
                addToast(this, "Heritage discovery logged", "#fff6c5");

                this.time.delayedCall(900, () => {
                    this.playerBusy = false;
                    setCrocExpression(this.player, "neutral");
                });
            }
        });
    }

    showGuideDialog() {
    // 1. Get the Guide's position from the stations array
    const guideStation = this.stations.find(s => s.id === "guide");
    const guideX = guideStation.x;
    const guideY = this.floorY - 220; // Position above the guide's head

    const dialogOptions = [
        { text: "Tell me about the artifacts", key: "artifacts" },
        { text: "What's the oldest item here?", key: "oldest" },
        { text: "How did they build the fortress?", key: "fortress" },
        { text: "Any funny stories?", key: "stories" },
        { text: "Just browsing around...", key: "browse" },
    ];

    const responses = {
        artifacts: "These relics tell stories of our ancient kingdom! The pottery was used in rituals, the guardian protected the fortress, and the blade belonged to our crocodile kings.",
        oldest: "That Stone Guardian! It's over 3,000 years old. It was carved to protect the fortress entrance from invaders.",
        fortress: "They used stone blocks fitted together perfectly without mortar. The craftsmanship was incredible!",
        stories: "Legend says a crocodile warrior once used that Royal Blade to win a great battle. He became a hero!",
        browse: "Of course! Explore at your own pace. There's so much history in these walls!",
    };

    setCrocExpression(this.player, "focused");

    // 2. Main Speech Bubble Background (Centered on the guide)
    const bubbleBg = this.add.rectangle(guideX, guideY, 450, 180, 0x2a1f14, 0.95)
        .setStrokeStyle(4, 0xd4a574).setDepth(50);
    
    // Tour Guide Label
    const guideChatHeader = this.add.text(guideX, guideY - 65, "TOUR GUIDE", { 
        fontSize: "20px", color: "#ffd966", fontStyle: "bold" 
    }).setOrigin(0.5).setDepth(51);

    // Main Message Text
    const messageText = this.add.text(guideX, guideY + 10, "Welcome! What would you like to know?", { 
        fontSize: "17px", color: "#e8dcc6", align: "center", wordWrap: { width: 400 } 
    }).setOrigin(0.5).setDepth(51);

    // 3. Panda Portrait (Placed to the left of the bubble)
    const guidePortrait = drawPanda(this, guideX - 280, guideY, 0.4).setDepth(52);
    const guideMouth = this.add.ellipse(guideX - 242, guideY - 12, 12, 4, 0x2a1a12).setDepth(53);
    
    const mouthTween = this.tweens.add({
        targets: guideMouth,
        scaleY: 2.2,
        duration: 150,
        yoyo: true,
        repeat: -1,
    });

    const optionObjects = [];

    const closeDialog = () => {
        optionObjects.forEach((obj) => obj.destroy());
        bubbleBg.destroy();
        guideChatHeader.destroy();
        messageText.destroy();
        guidePortrait.destroy();
        guideMouth.destroy();
        mouthTween.stop();
        this.playerBusy = false;
        setCrocExpression(this.player, "neutral");
    };

    // 4. Create Buttons (Stacked vertically in front of the guide)
    dialogOptions.forEach((opt, i) => {
        const btnY = guideY + 140 + (i * 45); 
        
        const btn = this.add.rectangle(guideX, btnY, 400, 38, 0x5f4a3a, 0.9)
            .setStrokeStyle(2, 0xd4a574)
            .setInteractive({ useHandCursor: true })
            .setDepth(51);

        const btnText = this.add.text(guideX, btnY, opt.text, { 
            fontSize: "15px", color: "#fff9e6", fontStyle: "bold" 
        }).setOrigin(0.5).setDepth(52);

        optionObjects.push(btn, btnText);

        btn.on("pointerover", () => btn.setFillStyle(0x7a6b54));
        btn.on("pointerout", () => btn.setFillStyle(0x5f4a3a));
        
        btn.on("pointerdown", () => {
            // Update text and remove options so the player can read the answer
            messageText.setText(responses[opt.key]);
            optionObjects.forEach(obj => obj.destroy());
            
            // Auto-close after reading the answer
            this.time.delayedCall(3500, closeDialog);
        });
    });
}

    sitAndReadBook(bookType, bookName) {
        if (!bookName) return;
        // Focus camera-like zoom on the selected artifact itself.
        setCrocExpression(this.player, "focused");
        this.tweens.add({
            targets: this.player,
            y: this.floorY - 96,
            scaleY: 0.82,
            duration: 400,
            ease: "Quad.easeIn",
        });

        this.time.delayedCall(500, () => {
            const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x0f1723, 0.55).setDepth(44).setScrollFactor(0);
            const zoomPanel = this.add.rectangle(W / 2, H / 2, 720, 420, 0x1f2b3b, 0.96)
                .setStrokeStyle(4, 0xaec6de).setDepth(45).setScrollFactor(0);
            const zoomTitle = this.add.text(W / 2, H / 2 - 156, `${bookName.toUpperCase()}`, {
                fontSize: "28px",
                color: "#f2f8ff",
                fontStyle: "bold",
                stroke: "#0b111a",
                strokeThickness: 4,
            }).setOrigin(0.5).setDepth(46).setScrollFactor(0);
            const stage = this.add.container(W / 2, H / 2 + 24).setDepth(47).setScrollFactor(0);
            if (bookType === "pottery") {
                stage.add(this.add.ellipse(0, 30, 200, 44, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf));
                stage.add(this.add.rectangle(0, 0, 96, 120, 0xd2c4ad).setStrokeStyle(2, 0x8f7a5e));
                stage.add(this.add.ellipse(0, -40, 100, 36, 0xba986f).setStrokeStyle(2, 0x8a6b45));
            } else if (bookType === "guardian") {
                stage.add(this.add.rectangle(0, 36, 200, 44, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf));
                stage.add(this.add.rectangle(0, 0, 86, 136, 0x8f9aaa).setStrokeStyle(2, 0xc8d2df));
                stage.add(this.add.circle(0, -56, 36, 0x9da7b4).setStrokeStyle(2, 0xc8d2df));
            } else if (bookType === "blade") {
                stage.add(this.add.rectangle(0, 40, 210, 44, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf));
                stage.add(this.add.rectangle(0, 0, 16, 150, 0xc8d3df).setStrokeStyle(1, 0xffffff, 0.5));
                stage.add(this.add.triangle(0, -74, -16, 20, 16, 20, 0, -22, 0xd9e6f5).setStrokeStyle(2, 0xffffff, 0.6));
            } else if (bookType === "skull") {
                stage.add(this.add.rectangle(0, 40, 210, 44, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf));
                stage.add(this.add.ellipse(0, -4, 136, 96, 0xd8ccb8).setStrokeStyle(2, 0x8f7a5e));
                stage.add(this.add.circle(-30, -12, 14, 0x5f5347));
                stage.add(this.add.circle(30, -12, 14, 0x5f5347));
            } else if (bookType === "bones") {
                stage.add(this.add.rectangle(0, 40, 210, 44, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf));
                stage.add(this.add.ellipse(0, 0, 180, 56, 0xc8b9a2).setStrokeStyle(2, 0x8f7a5e));
                stage.add(this.add.ellipse(-70, 0, 44, 24, 0xd8ccb8).setStrokeStyle(2, 0x8f7a5e));
                stage.add(this.add.ellipse(70, 0, 44, 24, 0xd8ccb8).setStrokeStyle(2, 0x8f7a5e));
            } else if (bookType === "tablet") {
                stage.add(this.add.rectangle(0, 40, 210, 44, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf));
                stage.add(this.add.rectangle(0, -2, 120, 146, 0xb5a58f).setStrokeStyle(2, 0x8f7a5e));
                for (let i = 0; i < 6; i++) {
                    stage.add(this.add.rectangle(0, -36 + i * 16, 84, 3, 0x8f7a5e));
                }
            } else if (bookType === "egg") {
                stage.add(this.add.rectangle(0, 40, 210, 44, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf));
                stage.add(this.add.ellipse(0, -4, 126, 86, 0xc8bcab).setStrokeStyle(2, 0x8f7a5e));
                stage.add(this.add.circle(0, -2, 30, 0xe0d6c6).setStrokeStyle(1, 0x8f7a5e));
            } else {
                stage.add(this.add.rectangle(0, 40, 210, 44, 0x7a5a3f).setStrokeStyle(2, 0xe6d5bf));
                stage.add(this.add.rectangle(0, -6, 36, 156, 0xbda889).setStrokeStyle(2, 0x8f7a5e));
                stage.add(this.add.triangle(0, -80, -28, 14, 28, 14, 0, -30, 0xd8c7aa).setStrokeStyle(1, 0x8f7a5e));
            }

            this.tweens.add({ targets: stage, scaleX: 1.05, scaleY: 1.05, duration: 650, yoyo: true, repeat: 2 });

            // Close button — lets player dismiss the artifact view at any time
            const closeArtBtn = this.add.rectangle(W / 2 + 260, H / 2 - 156, 90, 34, 0x993333)
                .setStrokeStyle(2, 0xffffff).setDepth(48).setScrollFactor(0).setInteractive({ useHandCursor: true });
            const closeArtLbl = this.add.text(W / 2 + 260, H / 2 - 156, "CLOSE", {
                fontSize: "15px", color: "#ffffff", fontStyle: "bold"
            }).setOrigin(0.5).setDepth(49).setScrollFactor(0);
            const destroyArt = () => {
                overlay.destroy(); zoomPanel.destroy(); zoomTitle.destroy();
                stage.destroy(); closeArtBtn.destroy(); closeArtLbl.destroy();
            };
            closeArtBtn.on("pointerdown", destroyArt);

            this.time.delayedCall(2500, () => {
                if (overlay.active) destroyArt();
            });
        });

        this.time.delayedCall(3000, () => {
            this.tweens.add({
                targets: this.player,
                y: this.floorY - 74,
                scaleY: 1,
                duration: 400,
                ease: "Quad.easeOut",
            });
        });
    }

    update() {
        const nearest = this.stations.slice().sort((a, b) => Math.abs(this.player.x - a.x) - Math.abs(this.player.x - b.x))[0];
        const nearEnough = nearest && Math.abs(this.player.x - nearest.x) < 130;
        this.promptText.setText(nearEnough ? `Press E: ${nearest.prompt}` : "Move near an exhibit and press E");

        if (!this.playerBusy) {
            let vx = 0;
            if (this.keys.left.isDown || this.keys.arrowLeft.isDown || this.phoneControls.isDown("left")) vx -= 220;
            if (this.keys.right.isDown || this.keys.arrowRight.isDown || this.phoneControls.isDown("right")) vx += 220;
            this.player.body.setVelocityX(vx);
            this.player.y = this.floorY - 74;
            if (vx > 8) {
                setCrocFacing(this.player, 1);
                setCrocExpression(this.player, "neutral");
            } else if (vx < -8) {
                setCrocFacing(this.player, -1);
                setCrocExpression(this.player, "focused");
            }
        } else {
            this.player.body.setVelocityX(0);
        }

        if ((Phaser.Input.Keyboard.JustDown(this.keys.e) || this.phoneControls.consume("e")) && nearEnough) {
            this.useStation(nearest);
        }
    }
}

class SettingsScene extends Phaser.Scene {
    constructor() {
        super("SettingsScene");
    }

    create() {
        setSceneMusic("background");
        applyDisplaySettings();
        ensureSettingsState();

        this.add.rectangle(W / 2, H / 2, W, H, 0x17243b);
        this.add.rectangle(W / 2, 120, 980, 120, 0x253d64, 0.8).setStrokeStyle(3, 0xffffff, 0.7);
        this.add.text(W / 2, 110, "GAME SETTINGS", {
            fontSize: "56px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#0a1424",
            strokeThickness: 6,
        }).setOrigin(0.5);

        this.valueTexts = {};

        const mkRow = (label, y, onMinus, onPlus, key) => {
            this.add.text(280, y, label, {
                fontSize: "26px",
                color: "#dff0ff",
                fontStyle: "bold",
            }).setOrigin(0, 0.5);
            const minus = uiButton(this, 760, y, 64, 44, "-", onMinus, 0x6a7fa2, 0x5a7092);
            minus.label.setFontSize("34px");
            const plus = uiButton(this, 980, y, 64, 44, "+", onPlus, 0x6a7fa2, 0x5a7092);
            plus.label.setFontSize("34px");
            this.valueTexts[key] = this.add.text(870, y, "", {
                fontSize: "24px",
                color: "#ffffff",
                fontStyle: "bold",
            }).setOrigin(0.5);
        };

        mkRow("Master Volume", 220,
            () => this.adjustVolume("masterVolume", -0.05),
            () => this.adjustVolume("masterVolume", 0.05),
            "masterVolume");
        mkRow("Music Volume", 280,
            () => this.adjustVolume("musicVolume", -0.05),
            () => this.adjustVolume("musicVolume", 0.05),
            "musicVolume");
        mkRow("SFX Volume", 340,
            () => this.adjustVolume("sfxVolume", -0.05),
            () => this.adjustVolume("sfxVolume", 0.05),
            "sfxVolume");

        this.flagTexts = {
            mute: this.add.text(870, 410, "", { fontSize: "22px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5),
            showPhoneControls: this.add.text(870, 470, "", { fontSize: "22px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5),
            highContrast: this.add.text(870, 530, "", { fontSize: "22px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5),
        };

        const mkToggle = (label, y, key) => {
            this.add.text(280, y, label, { fontSize: "26px", color: "#dff0ff", fontStyle: "bold" }).setOrigin(0, 0.5);
            const t = uiButton(this, 980, y, 160, 48, "TOGGLE", () => {
                STATE.settings[key] = !STATE.settings[key];
                saveSettings();
                applyDisplaySettings();
                setSceneMusic("background");
                this.refreshSettingsUI();
            }, 0x4b6ea8, 0x3d5d91);
            t.label.setFontSize("20px");
        };

        mkToggle("Mute All", 410, "mute");
        mkToggle("Phone Controls", 470, "showPhoneControls");
        mkToggle("High Contrast", 530, "highContrast");

        const fsBtn = uiButton(this, 380, 674, 240, 56, "FULLSCREEN", () => {
            const doc = document;
            if (!doc.fullscreenElement) {
                doc.documentElement.requestFullscreen?.();
            } else {
                doc.exitFullscreen?.();
            }
        }, 0x5a92b7, 0x497fa1);
        fsBtn.label.setFontSize("20px");

        const resetBtn = uiButton(this, 640, 674, 250, 56, "RESET DEFAULTS", () => {
            STATE.settings = {
                masterVolume: 0.9,
                musicVolume: 0.55,
                sfxVolume: 0.85,
                mute: false,
                showPhoneControls: true,
                highContrast: false,
                autoSave: true,
            };
            saveSettings();
            applyDisplaySettings();
            setSceneMusic("background");
            this.refreshSettingsUI();
        }, 0xb17a5a, 0xa36b4c);
        resetBtn.label.setFontSize("20px");

        const creditsBtn = uiButton(this, 900, 674, 190, 56, "CREDITS", () => this.scene.start("CreditsScene"), 0x7b9f7f, 0x64866a);
        creditsBtn.label.setFontSize("20px");

        uiButton(this, W - 100, 44, 170, 52, "HOME", () => this.scene.start("HubScene"), 0xff7d7d, 0xff5858);

        this.refreshSettingsUI();
    }

    adjustVolume(key, delta) {
        STATE.settings[key] = Phaser.Math.Clamp((STATE.settings[key] || 0) + delta, 0, 1);
        saveSettings();
        setSceneMusic("background");
        playSfx("click", { volume: 0.26, rate: 1.0 });
        this.refreshSettingsUI();
    }

    refreshSettingsUI() {
        const s = ensureSettingsState();
        this.valueTexts.masterVolume.setText(`${Math.round(s.masterVolume * 100)}%`);
        this.valueTexts.musicVolume.setText(`${Math.round(s.musicVolume * 100)}%`);
        this.valueTexts.sfxVolume.setText(`${Math.round(s.sfxVolume * 100)}%`);
        this.flagTexts.mute.setText(s.mute ? "ON" : "OFF");
        this.flagTexts.showPhoneControls.setText(s.showPhoneControls ? "ON" : "OFF");
        this.flagTexts.highContrast.setText(s.highContrast ? "ON" : "OFF");
    }
}

class CreditsScene extends Phaser.Scene {
    constructor() {
        super("CreditsScene");
    }

    create() {
        setSceneMusic("background");
        this.add.rectangle(W / 2, H / 2, W, H, 0x10253a);
        this.add.text(W / 2, 88, "GAME CREDITS", {
            fontSize: "56px",
            color: "#ffffff",
            fontStyle: "bold",
            stroke: "#0b1320",
            strokeThickness: 6,
        }).setOrigin(0.5);

        const creditLines = [
            "Design & Development: Dhurgham Alsaadi",
            "Gameplay Tuning: Croc Adventure Systems",
            "Special Thanks To You For Playing This Game!",
        ];

        const card = this.add.rectangle(W / 2, H / 2 + 30, 1040, 540, 0x1d3550, 0.92).setStrokeStyle(4, 0x9bc4ea);
        const credits = this.add.text(W / 2, H / 2 + 20, creditLines.join("\n"), {
            fontSize: "24px",
            color: "#e5f2ff",
            align: "center",
            lineSpacing: 8,
            fontStyle: "bold",
        }).setOrigin(0.5);

        this.tweens.add({
            targets: [card, credits],
            y: '-=14',
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        uiButton(this, 220, 706, 220, 60, "SETTINGS", () => this.scene.start("SettingsScene"), 0x87a7c7, 0x7092b4);
        uiButton(this, W - 100, 44, 170, 52, "HOME", () => this.scene.start("HubScene"), 0xff7d7d, 0xff5858);
    }
}

new Phaser.Game({
    type: Phaser.AUTO,
    width: W,
    height: H,
    parent: "game-container",
    physics: {
        default: "arcade",
        arcade: { debug: false },
    },
    scene: [
        WelcomeScene,
        HubScene,
        StarCatchScene,
        RiverRunScene,
        MemoryScene,
        DrawScene,
        ShopScene,
        //WorkoutScene,
        KitchenScene,
        BedroomScene,
        LibraryScene,
        ToiletScene,
        TVScene,
        MuseumScene,
        SettingsScene,
        CreditsScene,
    ],
});


