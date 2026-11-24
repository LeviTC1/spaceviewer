import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const frontendRoot = resolve(import.meta.dirname, "..");
const crateRoot = join(frontendRoot, "engine", "spaceviewer-wgpu");
const cargoHome = process.env.CARGO_HOME || join(homedir(), ".cargo");
const cargo = join(cargoHome, "bin", "cargo");
const wasmBindgen = join(cargoHome, "bin", "wasm-bindgen");

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(cargo, ["build", "--target", "wasm32-unknown-unknown", "--release"], crateRoot);
run(wasmBindgen, [
  "target/wasm32-unknown-unknown/release/spaceviewer_wgpu.wasm",
  "--target", "web",
  "--out-dir", "../../src/engine-wasm/pkg",
  "--out-name", "spaceviewer_wgpu",
  "--typescript",
], crateRoot);

console.log("SpaceViewer Rust/WASM wgpu engine built successfully.");

