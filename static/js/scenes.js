/* ============================================================
   DRAMAZ 3D — Three.js scenes.
   Everything is built from primitives (no external model files),
   flat-shaded and lit like a small soundstage, so it stays fast
   and matches the app's dark/amber identity.
   ============================================================ */

const ACCENT = 0xcf9e5b;
const ACCENT_DIM = 0x5a4529;
const BODY = 0x1c1c20;
const BODY_DARK = 0x141417;

/* ---------- shared helpers ---------- */

function mat(color, opts) {
  return new THREE.MeshStandardMaterial(
    Object.assign({ color: color, roughness: 0.75, metalness: 0.1, flatShading: true }, opts || {})
  );
}

function group(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  return g;
}

/* ============================================================
   STATION PROPS — one per agent, themed to its job
   ============================================================ */

// Trend Scout — a scanning satellite dish
function buildRadar() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.18, 6), mat(BODY));
  base.position.y = 0.09;
  g.add(base);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 6), mat(BODY));
  mast.position.y = 0.45;
  g.add(mast);

  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6),
    mat(BODY, { side: THREE.DoubleSide })
  );
  dish.position.y = 0.8;
  dish.rotation.x = -Math.PI / 3.2;
  g.add(dish);

  const feed = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(ACCENT, { emissive: ACCENT, emissiveIntensity: 0.5 }));
  feed.position.set(0, 0.93, 0.22);
  g.add(feed);
  g.userData.glow = [feed];
  g.userData.spin = dish;
  return g;
}

// Concept Architect — a drafting desk with script pages
function buildDesk() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.75), mat(BODY));
  top.position.y = 0.6;
  top.rotation.x = -0.13;
  g.add(top);

  [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 5), mat(BODY_DARK));
    leg.position.set(x, 0.3, z);
    g.add(leg);
  });

  const pages = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.012, 0.56),
      mat(0xdad4c8, { emissive: ACCENT, emissiveIntensity: 0.18, roughness: 0.9 })
    );
    p.position.set(-0.02 * i, 0.66 + i * 0.016, 0.02 * i);
    p.rotation.set(-0.13, 0.05 * i, 0);
    pages.add(p);
  }
  g.add(pages);
  g.userData.glow = pages.children;
  g.userData.float = pages;
  return g;
}

// Season Planner — a storyboard wall of frames
function buildStoryboard() {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 0.07), mat(BODY));
  board.position.y = 0.85;
  g.add(board);

  [[-0.45, 0.18], [0, 0.18], [0.45, 0.18], [-0.45, -0.22], [0, -0.22], [0.45, -0.22]].forEach(([x, y], i) => {
    const f = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.28, 0.03),
      mat(0x2a2a30, { emissive: ACCENT, emissiveIntensity: 0.12 })
    );
    f.position.set(x, 0.85 + y, 0.05);
    f.userData.order = i;
    g.add(f);
    if (!g.userData.glow) g.userData.glow = [];
    g.userData.glow.push(f);
  });

  [-0.6, 0.6].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.36, 5), mat(BODY_DARK));
    leg.position.set(x, 0.18, 0);
    g.add(leg);
  });
  g.userData.sequence = true;
  return g;
}

// Episode Director — a film camera on a tripod
function buildCamera() {
  const g = new THREE.Group();

  const head = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.38, 0.68), mat(BODY));
  body.position.y = 0.95;
  head.add(body);

  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.34, 14), mat(BODY_DARK));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.95, 0.48);
  head.add(lens);

  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 16),
    mat(ACCENT, { emissive: ACCENT, emissiveIntensity: 0.6 })
  );
  glass.position.set(0, 0.95, 0.655);
  head.add(glass);

  [-0.16, 0.16].forEach((x) => {
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 18), mat(BODY_DARK));
    reel.position.set(x, 1.2, -0.05);
    head.add(reel);
  });
  g.add(head);

  [0, 2.09, 4.19].forEach((a) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.95, 5), mat(BODY_DARK));
    leg.position.set(Math.sin(a) * 0.26, 0.42, Math.cos(a) * 0.26);
    leg.rotation.set(Math.cos(a) * 0.28, 0, -Math.sin(a) * 0.28);
    g.add(leg);
  });

  g.userData.glow = [glass];
  g.userData.pan = head;
  return g;
}

/* ============================================================
   OFFICE SCENE — the soundstage floor
   ============================================================ */

const OfficeScene = (function () {
  let renderer, scene, camera, raf, container, labelLayer;
  let stations = [];
  let statusFn = () => ({});
  let clock;

  const LAYOUT = [
    { key: "trends", label: "Trend Scout", build: buildRadar, x: -2.35, z: 1.5 },
    { key: "concept", label: "Concept Architect", build: buildDesk, x: -2.15, z: -1.6 },
    { key: "season", label: "Season Planner", build: buildStoryboard, x: 1.4, z: -1.75 },
    { key: "episode", label: "Episode Director", build: buildCamera, x: 1.75, z: 1.55 },
  ];

  function init(containerEl, getStatuses) {
    if (renderer) return;
    container = containerEl;
    statusFn = getStatuses;
    clock = new THREE.Clock();

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x08090a, 9, 20);

    const w = container.clientWidth || 900;
    const h = container.clientHeight || 520;

    camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.set(4.6, 4.1, 6.0);
    camera.lookAt(0, 0.75, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    labelLayer = document.createElement("div");
    labelLayer.className = "scene-labels";
    container.appendChild(labelLayer);

    // Stage floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(5.4, 64),
      mat(0x121216, { roughness: 0.9, metalness: 0.08 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5.25, 5.4, 64),
      new THREE.MeshBasicMaterial({ color: ACCENT, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    scene.add(ring);

    scene.add(new THREE.AmbientLight(0xffffff, 0.42));
    scene.add(new THREE.HemisphereLight(0x8b97ab, 0x111114, 0.7));

    // soft fill from the camera side so idle props still read
    const fill = new THREE.DirectionalLight(0xdfe6f2, 0.55);
    fill.position.set(4, 6, 6);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(ACCENT, 0.4);
    rim.position.set(-5, 3, -4);
    scene.add(rim);

    LAYOUT.forEach((def) => {
      const g = group(def.x, def.z);
      const prop = def.build();
      prop.scale.setScalar(1.15);
      g.add(prop);

      // riser
      const riser = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, 0.1, 32), mat(0x1a1a1f));
      riser.position.y = 0.05;
      g.add(riser);

      // key light above the station
      const spot = new THREE.SpotLight(ACCENT, 0.5, 9, Math.PI / 6.5, 0.5, 1.4);
      spot.position.set(def.x, 4.2, def.z + 0.4);
      spot.target.position.set(def.x, 0.4, def.z);
      scene.add(spot);
      scene.add(spot.target);

      // hanging fixture
      const fixture = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 8, 1, true), mat(BODY_DARK, { side: THREE.DoubleSide }));
      fixture.position.set(def.x, 3.5, def.z + 0.4);
      scene.add(fixture);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.4, 4), mat(BODY_DARK));
      rod.position.set(def.x, 4.3, def.z + 0.4);
      scene.add(rod);

      scene.add(g);

      const label = document.createElement("div");
      label.className = "scene-label";
      label.innerHTML = `<span class="scene-label-dot"></span><span class="scene-label-text">${def.label}</span><span class="scene-label-status">Idle</span>`;
      labelLayer.appendChild(label);

      stations.push({ def, group: g, prop, spot, label, anchor: new THREE.Vector3(def.x, 1.55, def.z) });
    });

    // drifting dust motes
    const dustGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 130; i++) {
      pts.push((Math.random() - 0.5) * 13, Math.random() * 4.4 + 0.2, (Math.random() - 0.5) * 11);
    }
    dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: ACCENT, size: 0.035, transparent: true, opacity: 0.42 })
    );
    scene.add(dust);
    scene.userData.dust = dust;

    window.addEventListener("resize", resize);
    animate();
  }

  function resize() {
    if (!renderer || !container || !container.clientWidth) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function applyStatuses() {
    const statuses = statusFn() || {};
    stations.forEach((s) => {
      s.status = statuses[s.def.key] || "locked";
      const label = s.label;
      const text = s.status === "active" ? "Working" : s.status === "complete" ? "Done" : "Idle";
      label.querySelector(".scene-label-status").textContent = text;
      label.classList.toggle("is-active", s.status === "active");
      label.classList.toggle("is-complete", s.status === "complete");
    });
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    stations.forEach((s, idx) => {
      const active = s.status === "active";
      const complete = s.status === "complete";

      // key light responds to agent status
      const target = active ? 2.2 + Math.sin(t * 2.6) * 0.7 : complete ? 1.35 : 0.42;
      s.spot.intensity += (target - s.spot.intensity) * 0.08;

      // emissive props
      const glowTarget = active ? 0.85 : complete ? 0.4 : 0.05;
      (s.prop.userData.glow || []).forEach((m, i) => {
        const em = m.material;
        if (!em.emissiveIntensity && em.emissiveIntensity !== 0) return;
        let want = glowTarget;
        if (s.prop.userData.sequence && active) {
          want = 0.15 + (Math.sin(t * 3 - i * 0.7) * 0.5 + 0.5) * 0.9;
        }
        em.emissiveIntensity += (want - em.emissiveIntensity) * 0.09;
      });

      // idle motion, only when the agent is doing something
      if (s.prop.userData.spin) s.prop.userData.spin.rotation.y += active ? 0.014 : 0.002;
      if (s.prop.userData.float) s.prop.userData.float.position.y = Math.sin(t * 1.5 + idx) * (active ? 0.035 : 0.01);
      if (s.prop.userData.pan) s.prop.userData.pan.rotation.y = Math.sin(t * (active ? 0.9 : 0.25) + idx) * (active ? 0.34 : 0.1);

      s.group.position.y = Math.sin(t * 0.9 + idx * 1.3) * 0.02;
    });

    if (scene.userData.dust) scene.userData.dust.rotation.y = t * 0.012;

    // project labels to screen space
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    stations.forEach((s) => {
      const v = s.anchor.clone().project(camera);
      s.label.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
      s.label.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
    });

    renderer.render(scene, camera);
  }

  function start(containerEl, getStatuses) {
    if (!window.THREE) return;
    if (!renderer) init(containerEl, getStatuses);
    else if (!raf) animate();
    resize();
    applyStatuses();
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  return { start, stop, refresh: applyStatuses };
})();

/* ============================================================
   ACCENT ICONS — small rotating 3D marks per section
   ============================================================ */

function initAccentIcon(canvas, type) {
  if (!window.THREE || !canvas || canvas.dataset.ready) return;
  canvas.dataset.ready = "1";

  const size = 64;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
  camera.position.set(1.5, 1.4, 2.6);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(size, size, false);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.PointLight(ACCENT, 1.5, 12);
  key.position.set(2.4, 2.6, 2.8);
  scene.add(key);

  const obj = new THREE.Group();

  if (type === "radar") {
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6),
      mat(BODY, { side: THREE.DoubleSide })
    );
    dish.rotation.x = -Math.PI / 3;
    obj.add(dish);
    const feed = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat(ACCENT, { emissive: ACCENT, emissiveIntensity: 0.7 }));
    feed.position.set(0, 0.22, 0.36);
    obj.add(feed);
  } else if (type === "board") {
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.16, 24), mat(BODY));
    reel.rotation.x = Math.PI / 2.6;
    obj.add(reel);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.17, 0.2, 12),
        mat(ACCENT, { emissive: ACCENT, emissiveIntensity: 0.45 })
      );
      hole.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
      hole.rotation.x = Math.PI / 2;
      reel.add(hole);
    }
  } else {
    // clapperboard
    const slate = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.85, 0.1), mat(BODY));
    obj.add(slate);
    const stick = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 0.1), mat(ACCENT, { emissive: ACCENT, emissiveIntensity: 0.4 }));
    stick.position.set(0.03, 0.56, 0.01);
    stick.rotation.z = 0.22;
    obj.add(stick);
    for (let i = -1; i <= 1; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.02), mat(0x2e2e34));
      line.position.set(0, i * 0.2 - 0.08, 0.06);
      obj.add(line);
    }
  }

  scene.add(obj);

  let raf;
  (function loop() {
    raf = requestAnimationFrame(loop);
    obj.rotation.y += 0.008;
    obj.rotation.x = Math.sin(Date.now() * 0.0006) * 0.12;
    renderer.render(scene, camera);
  })();
}
