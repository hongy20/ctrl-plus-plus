# 🏎️ lego-autopilot

The official **LEGO Control+** and **Powered Up** apps for remote-controlled vehicles offer a frustrating driving experience: the stock touch joysticks and sliders lack tactile feedback, holding a steady cruising speed is difficult, and braking is strictly **binary (all-or-nothing)**—lifting your thumb or hitting brake either coasts freely (`Float`) or slams the motor coils/shaft locked (`Brake 127` / `Hold 126`) with an abrupt jerk instead of decelerating like a real car.

`lego-autopilot` replaces the stock app with a direct **Mobile Web Bluetooth** controller and autopilot running right in your phone's browser:
- **Realistic Driving & Progressive Braking:** Tilt your phone to steer, hold calibrated ground speeds (`m/s`), and apply smooth **progressive braking** (`0–100%` deceleration curve before engaging low-speed hold).
- **Automated Driving Tricks:** Execute one-tap stunts and maneuvers like **parallel parking**, **3-point turns**, and **U-turns** using the hub's built-in motor encoders and 6-axis IMU.
- **FPV Camera & Home Racing (Future):** Integrate a lightweight driver-view camera pod to build mixed-reality / FPV living-room racing games inspired by ***Mario Kart Live: Home Circuit***.

## 🛠️ Hardware

Currently, I only test this project on my stock **[LEGO Technic 42124 Off-Road Buggy](https://www.lego.com/en-us/product/off-road-buggy-42124)** (with zero hardware or wiring modifications):

<p align="center">
  <img src="https://cdn.rebrickable.com/media/sets/42124-1.jpg" alt="LEGO Technic 42124 Off-Road Buggy" width="420" />
</p>

## 🚀 Quick Start
```bash
npm install
npm run dev -- --host     # Serve over local HTTPS for Android Chrome
```
1. Open `https://<mac-ip>:5173` in **Android Chrome** and tap **"Add to Home Screen"** (caches the app offline so you don't need a laptop running).
2. Turn on the LEGO Technic Hub, tap **Connect**, and run **Steering & 1m Speed Calibration**.

## 🧠 SDLC (Software Development Life Cycle)

This project adopts **AI-Native Spec-Driven Development (SDD)**. Instead of writing code manually or relying on unstructured "vibe coding" prompts, **specifications are treated as the primary artifact and single source of truth**. Every feature begins by defining clear system boundaries, state machines, and behavioral requirements in plain language; autonomous AI agents then take over to plan, write tests, implement, review, and verify the code against those specs.

*In short, the goal is to build and evolve this entire project through specifications alone—without writing or editing a single line of source code by hand.*
