//! ReflexWork explainer — a three-scene fframes video.
//! 1) the filter in front of the LLM, 2) the 4-way decision + 0-token,
//! 3) the self-improving learning loop. SVG + Rust, rendered with fframes.
use fframes::{
    AnimateRuntimeInput, AudioMap, Color, Duration, FFramesContext, Frame, Scene,
    Scenes, Svgr, Transform, Video,
    animation::{AnimationRuntime, Easing},
    include_media_dir,
};
use std::sync::LazyLock;

include_media_dir!(pub struct ReflexworkExplainerMedia, "media");

pub const WIDTH: usize = 1920;
pub const HEIGHT: usize = 1080;
pub const SCENE_SECONDS: f32 = 6.0;
const TOTAL_SECONDS: f32 = SCENE_SECONDS * 3.0;

// Dark theme matching the slides deck.
const BG: &str = "#0b1020";
const PANEL: &str = "#121a33";
const INK: &str = "#e9edff";
const MUTED: &str = "#9fb0d8";
const ACCENT: &str = "#5b8cff";
const FAST: &str = "#22c58b";
const LLM: &str = "#f6a93b";
const AUDIT: &str = "#b07bff";
const LINE: &str = "#2a3660";
const FONT: &str = "Sathu";
const WEIGHT: u16 = 500;

static EASE: LazyLock<AnimationRuntime> =
    LazyLock::new(|| AnimationRuntime::new(0.8, &Easing::CubicBezier(0.16, 1.0, 0.3, 1.0)));
static SPRING: LazyLock<AnimationRuntime> = LazyLock::new(|| {
    AnimationRuntime::new(3.0, &Easing::Spring { mass: 1.0, stiffness: 180.0, damping: 20.0 })
});

pub struct ReflexworkExplainerVideo<'a> {
    pub media: &'a ReflexworkExplainerMedia,
    filter: FilterScene,
    decide: DecideScene,
    learn: LearnScene,
}

impl<'a> ReflexworkExplainerVideo<'a> {
    pub fn new(media: &'a ReflexworkExplainerMedia, _title: &'a str) -> Self {
        Self { media, filter: FilterScene, decide: DecideScene, learn: LearnScene }
    }
}

impl std::fmt::Debug for ReflexworkExplainerVideo<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ReflexworkExplainerVideo").finish()
    }
}

impl Video for ReflexworkExplainerVideo<'_> {
    const FPS: usize = 30;
    const WIDTH: usize = WIDTH;
    const HEIGHT: usize = HEIGHT;
    const BACKGROUND_COLOR: Color = Color::WHITE;

    fn duration(&self) -> Duration<'_> { Duration::Auto }
    fn audio(&self) -> AudioMap<'_> { AudioMap::none() }
    fn define_scenes(&self) -> Scenes<'_> {
        Scenes::from(vec![&self.filter as &dyn Scene, &self.decide, &self.learn])
    }

    fn render_frame<'a>(&'a self, frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let progress = (frame.seconds() / TOTAL_SECONDS * 1536.0).max(0.5);
        fframes::svgr!(
            <svg xmlns="http://www.w3.org/2000/svg" width={WIDTH} height={HEIGHT} viewBox="0 0 1920 1080">
                <rect width="1920" height="1080" fill={BG} />
                {ctx.render_scenes(&frame)}
                <path d="M192 946 H1728" stroke={LINE} stroke-width="2" />
                <rect x="192" y="945" width={progress} height="3" fill={ACCENT} />
                <text x="192" y="1002" font-family={FONT} font-weight={WEIGHT} font-size="28" fill={MUTED}>"ReflexWork"</text>
                <text x="1728" y="1002" text-anchor="end" font-family={FONT} font-weight={WEIGHT} font-size="28" fill={MUTED}>"RUST + SVG · 0 TOKEN"</text>
            </svg>
        )
    }
}

fn ramp(frame: &Frame, start: f32) -> f32 {
    frame.animate_runtime(AnimateRuntimeInput { on_second: start, from: 0.0, to: 1.0, animation_runtime: &EASE })
}
fn rise(frame: &Frame, start: f32) -> f32 {
    frame.animate_runtime(AnimateRuntimeInput { on_second: start, from: 56.0, to: 0.0, animation_runtime: &SPRING })
}
fn label<'a>(number: &'a str, title: &'a str) -> Svgr<'a> {
    fframes::svgr!(<g font-family={FONT} font-size="30" font-weight={WEIGHT} fill={INK}>
        <circle cx="209" cy="147" r="17" fill={ACCENT} />
        <text x="252" y="158">{title}</text>
        <text x="1728" y="158" text-anchor="end">{number}</text>
    </g>)
}

// Scene 1 — the filter in front of the LLM.
#[derive(Debug)]
struct FilterScene;
impl Scene for FilterScene {
    fn duration(&self) -> Duration<'_> { Duration::Seconds(SCENE_SECONDS) }
    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let kernel = ramp(&frame, 0.5);
        let fast = ramp(&frame, 1.1);
        let llm = ramp(&frame, 1.5);
        fframes::svgr!(<g font-family={FONT} font-weight={WEIGHT}>
            {label("01 / 03", "ชั้นคัดกรองหน้า LLM")}
            <text x="192" y="400" font-size="128" letter-spacing="-4" fill={INK}>"คัดก่อน"</text>
            <text x="192" y="520" font-size="128" letter-spacing="-4" fill={INK}>"ค่อยจ่ายค่า AI"</text>
            <text x="192" y="600" font-size="46" fill={MUTED}>"Reflex Kernel ตัดสินทุกคำถามในไมโครวินาที"</text>
            <g transform={Transform::translate(0, rise(&frame, 0.4))}>
                <rect x="1060" y="300" width="300" height="110" rx="16" fill={PANEL} stroke={LINE} stroke-width="2" opacity={ramp(&frame,0.2)} />
                <text x="1210" y="365" text-anchor="middle" font-size="40" fill={INK}>"คำถาม"</text>
                <g opacity={kernel}>
                    <rect x="1420" y="285" width="300" height="140" rx="20" fill={ACCENT} />
                    <text x="1570" y="345" text-anchor="middle" font-size="40" fill={BG}>"Kernel"</text>
                    <text x="1570" y="392" text-anchor="middle" font-size="28" fill={BG}>"gate · microsec"</text>
                </g>
                <g opacity={fast}>
                    <rect x="1300" y="520" width="420" height="96" rx="16" fill="#143027" stroke={FAST} stroke-width="2" />
                    <text x="1330" y="580" font-size="34" fill={FAST}>"FastPath · 0 token (80%)"</text>
                </g>
                <g opacity={llm}>
                    <rect x="1300" y="650" width="420" height="96" rx="16" fill="#31260f" stroke={LLM} stroke-width="2" />
                    <text x="1330" y="710" font-size="34" fill={LLM}>"LLM path (20%)"</text>
                </g>
            </g>
        </g>)
    }
}

// Scene 2 — the 4-way decision.
#[derive(Debug)]
struct DecideScene;
impl Scene for DecideScene {
    fn duration(&self) -> Duration<'_> { Duration::Seconds(SCENE_SECONDS) }
    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let cards = [
            ("factual", "FastPath · 0 token · เป๊ะ", FAST),
            ("advice", "grounded hybrid · ลื่น ไม่มั่ว", ACCENT),
            ("off-corpus", "abstain · ส่ง staff", LLM),
            ("personal", "intake · เก็บข้อมูลก่อน", AUDIT),
        ];
        let rows: Vec<Svgr> = cards.into_iter().enumerate().map(|(i, (k, v, c))| {
            let col = i % 2; let row = i / 2;
            let x = 192 + col as i32 * 790; let y = 360 + row as i32 * 230;
            let start = 0.4 + i as f32 * 0.14;
            fframes::svgr!(<g opacity={ramp(&frame,start)} transform={Transform::translate(0, rise(&frame,start))}>
                <rect x={x} y={y} width="740" height="190" rx="22" fill={PANEL} stroke={LINE} stroke-width="2" />
                <rect x={x} y={y} width="8" height="190" rx="4" fill={c} />
                <text x={x+48} y={y+78} font-size="52" fill={c}>{k}</text>
                <text x={x+48} y={y+140} font-size="36" fill={MUTED}>{v}</text>
            </g>)
        }).collect();
        fframes::svgr!(<g font-family={FONT} font-weight={WEIGHT}>
            {label("02 / 03", "ตัดสินใจ 4 ทาง")}
            <text x="192" y="300" font-size="96" letter-spacing="-3" fill={INK}>"คำถามเดียว เลือกทางที่ถูกที่สุด"</text>
            {rows}
        </g>)
    }
}

// Scene 3 — the self-improving learning loop.
#[derive(Debug)]
struct LearnScene;
impl Scene for LearnScene {
    fn duration(&self) -> Duration<'_> { Duration::Seconds(SCENE_SECONDS) }
    fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let steps = [
            ("Gap", "คำถามที่ตอบไม่ได้", FAST),
            ("Confidence (ตก)", "KB ข้อไหนแย่ (เรียนรู้เอง)", LLM),
            ("Auto-draft", "AI ร่าง · staff อนุมัติ", ACCENT),
        ];
        let rows: Vec<Svgr> = steps.into_iter().enumerate().map(|(i, (k, v, c))| {
            let y = 380 + i as i32 * 170;
            let start = 0.4 + i as f32 * 0.16;
            fframes::svgr!(<g opacity={ramp(&frame,start)} transform={Transform::translate(rise(&frame,start) as i32 as f32, 0.0)}>
                <circle cx="248" cy={y+40} r="22" fill={c} />
                <text x="248" y={y+52} text-anchor="middle" font-size="30" fill={BG}>{format!("{}", i+1)}</text>
                <text x="316" y={y+38} font-size="52" fill={INK}>{k}</text>
                <text x="316" y={y+92} font-size="36" fill={MUTED}>{v}</text>
            </g>)
        }).collect();
        fframes::svgr!(<g font-family={FONT} font-weight={WEIGHT}>
            {label("03 / 03", "ยิ่งใช้ยิ่งฉลาด")}
            <text x="192" y="300" font-size="96" letter-spacing="-3" fill={INK}>"รู้ว่าขาดอะไร แล้วปิดช่องเอง"</text>
            {rows}
            <g opacity={ramp(&frame, 1.3)}>
                <rect x="192" y="890" width="1536" height="2" fill={LINE} />
                <text x="192" y="862" font-size="40" fill={FAST}>"ไม่ retrain · คนแค่กด approve · corpus โตจากงานจริง"</text>
            </g>
        </g>)
    }
}
