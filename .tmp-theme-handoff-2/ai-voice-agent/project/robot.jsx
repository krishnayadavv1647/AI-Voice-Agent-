// robot.jsx — animated 3D-mascot built from the cropped product render.
// Soft circular mask hides the baked rectangle; an accent-tinted glow disc sits behind
// so the halo recolors with the theme. Idle bob + glow pulse; triggerRobotReaction() wiggles.

function triggerRobotReaction() {
  document.querySelectorAll(".js-robot-img").forEach((el) => {
    el.classList.remove("robot-react");
    // force reflow so the animation can replay
    void el.offsetWidth;
    el.classList.add("robot-react");
  });
}

function Robot({ size = 240, head = false, ring = false, glow = true, float = true, className = "", style }) {
  const src = head ? "assets/robot-head.png" : "assets/robot.png";
  return (
    <div
      className={"robot-wrap " + className}
      style={{ width: size, height: size, ...style }}
    >
      {glow && <div className="robot-glow" />}
      {ring && (
        <div className="robot-ring">
          <span className="robot-ring-dot" />
        </div>
      )}
      <img
        src={src}
        alt="AI assistant"
        className={"js-robot-img robot-img" + (float ? " robot-float" : "")}
        draggable="false"
      />
    </div>
  );
}

Object.assign(window, { Robot, triggerRobotReaction });
