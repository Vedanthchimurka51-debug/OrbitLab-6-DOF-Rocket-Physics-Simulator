# OrbitLab 6-DOF — Computational Rocket Physics & Propulsive Landing Simulator

## About

An interactive, deterministic 6-DOF rigid-body rocket flight simulator built with **TypeScript**, **Three.js**, and **React**. The computational physics engine (`src/physics/`) is strictly decoupled from rendering and UI layers, uses SI units throughout, and can be executed and verified headlessly from the command line.

### Try It Yourself

Launch the full-screen interactive 3D simulator directly in your browser without installing anything locally:

**[Launch Interactive 3D Simulator](https://ai.studio/apps/8f107edc-d450-43e5-b501-98a70a776f28?fullscreenApplet=true)**

---

## Architecture

```text
src/
├── physics/                 # Pure TypeScript 6-DOF engine (zero DOM / Three.js dependencies)
│   ├── math.ts              # Vec3, Quat, Hamilton quaternion kinematics, Euler conversions
│   ├── types.ts             # SI vehicle parameters, 13-state vector, telemetry & force structs
│   ├── environment.ts       # Inverse-square gravity g(y), exponential atmosphere ρ(y), wind & drag
│   ├── propulsion.ts        # Variable-mass propulsion, Tsiolkovsky Δv, slew-limited TVC gimbal
│   ├── controller.ts        # Cascaded PID propulsive landing, ascent gravity-turn, manual sandbox
│   ├── integrator.ts        # Fixed-timestep 4th-Order Runge-Kutta (RK4) + ground contact & crash
│   └── simulator.ts         # Fixed-dt accumulator, user touch impulse injection, energy telemetry
├── tests/                   # Headless numerical verification & convergence suite
│   ├── physicsVerification.ts
│   └── runTests.ts
└── viz_ui/                  # Three.js daylight desert test range & React HUD
    ├── RocketViewport.tsx   # WebGL2 scene, Studio IBL, OrbitControls, 3D raycast grab/poke/target
    ├── rocketMesh.ts        # Procedural orbital booster with animated legs, grid fins & gimbal bell
    ├── desertScene.ts       # Launch pad, mesas, gantry, windsock, trajectory trail, force arrows
    ├── crashEffects.ts      # Fireball blast, ground shockwave, 36 ballistic debris shards & audio
    ├── HowItWorksTour.tsx   # Guided live-physics 3D walkthrough across 4 flight demonstrations
    ├── useCanvasRecorder.ts # Built-in 60 fps WebGL canvas MediaRecorder (.webm export)
    ├── TelemetryRibbon.tsx  # Live SI telemetry HUD & camera preset switcher
    ├── ControlDock.tsx      # Flight modes, Physics Lab presets, parameter sliders & sandbox controls
    └── VerificationModal.tsx
```

---

## Physics & Mathematical Model

All quantities use strict **SI units** (`kg`, `m`, `s`, `N`, `rad`, `Pa`, `kg/m³`).

1. **Variable-Mass Propulsion & TVC**
   - $m(t) = m_{\text{dry}} + m_{\text{prop}}(t)$, $\dot{m} = -\text{throttle} \cdot \dot{m}_{\max}$
   - $v_e = I_{\text{sp}} \cdot g_{\text{std}}$, $F_T = \text{throttle} \cdot \dot{m}_{\max} \cdot v_e$
   - Vacuum delta-v check: $\Delta v = v_e \ln(m_0 / m_{\text{dry}})$
   - Slew-rate- and angle-clamped TVC nozzle deflections $(\delta_{\text{pitch}}, \delta_{\text{yaw}})$ generate body torque $\boldsymbol{\tau}_{\text{TVC}} = \mathbf{r}_{\text{nozzle}} \times \mathbf{F}_{\text{thrust,body}}$.

2. **Environment & Aerodynamics**
   - Inverse-square gravity: $g(y) = g_0 \left(\frac{R}{R + \max(0, y)}\right)^2$
   - Exponential atmosphere: $\rho(y) = \rho_0 \exp(-\max(0, y)/H_{\text{scale}})$
   - Quadratic drag: $\mathbf{F}_d = -\frac{1}{2}\rho(y) C_d A \|\mathbf{v}_{\text{rel}}\| \mathbf{v}_{\text{rel}}$, with CoP–CoM offset torque $\boldsymbol{\tau}_{\text{aero}} = \mathbf{r}_{\text{CoP}} \times \mathbf{F}_{\text{aero,body}}$.

3. **13-State 6-DOF RK4 Integration**
   - State vector: $[\mathbf{p}, \mathbf{v}, \mathbf{q}, \boldsymbol{\omega}, m_{\text{prop}}]$ integrated via fixed-timestep RK4 (`dt = 0.005 s`) with quaternion renormalization ($\|\mathbf{q}\| = 1$) after every step.
   - Progressive fidelity modes: `1D` (vertical), `2D` (planar pitch/horizontal), and full `3D` 6-DOF.
   - Ground contact solver handles landing-leg compression, safe/hard touchdown classification, and high-energy tip-over / crash impact (`crashIntensity`, ballistic debris, shockwave).

---

## Getting Started

### Install & Run Locally (Requires Node.js >= 20)

```bash
npm install
npm start
```

This starts Vite and opens `http://localhost:3000` in your browser.

> **Windows PowerShell note:** If PowerShell displays *"running scripts is disabled on this system"*, either run in **Command Prompt (`cmd`)**, use `npm.cmd install && npm.cmd start`, or enable local scripts once in PowerShell:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```

### Build & Type-Check

```bash
npm run lint
npm run build
```

### Deploy to Netlify

This repository includes `netlify.toml` preconfigured with `npm run build` and `dist/` publishing:
1. Push this project to GitHub (or upload the files via GitHub web upload).
2. On Netlify, choose **Add new site -> Import an existing project -> GitHub** and select the repository.
3. Click **Deploy site** — Netlify builds and hosts the live 3D simulator automatically.

### Run Headless Physics Verification Suite

```bash
npm run test:physics
```

Validates:
- Vacuum Tsiolkovsky rocket equation ($\Delta v$ accuracy vs. analytical solution)
- Atmospheric free-fall drop & terminal velocity convergence
- RK4 4th-order temporal convergence ($\approx 16\times$ error reduction per $2\times$ step refinement)
- Closed-loop PID TVC landing & mid-air disturbance recovery

---

## Interactive 3D Controls & Demo Recording

- **How It Works Tour**: Click **How It Works** in the top HUD to step through 4 live 3D physics demonstrations (Hover-Slam TVC, Mid-Air Disturbance Recovery, Ballistic Crash & Debris, and Gravity-Turn Ascent).
- **Record 3D Demo Videos (`.webm`)**: Click **Record** in the bottom dock (or inside the tour) to capture 60 fps footage directly from the WebGL viewport and download an `.webm` clip you can embed in pull requests or `README.md`.
- **Touchable 3D Interactions**: Switch between **Camera Orbit**, **Grab Rocket** (drag in 3D space), **Impulse Poke** (tap/drag to apply disturbance forces & torques), and **Set Target** (click desert terrain to relocate the landing pad).
- **Keyboard Shortcuts**: `Space` play/pause · `R` reset · `H` collapse/expand control dock · `W/A/S/D` + `Shift/Ctrl` in Manual Sandbox mode.
