export interface SpringConfig { stiffness: number; damping: number }

/** A damped spring. Physics rather than keyframes, so a new target mid-motion keeps its speed. */
export class Spring {
  value: number
  target: number
  velocity = 0
  config: SpringConfig
  constructor(value: number, config: SpringConfig) {
    this.value = value
    this.target = value
    this.config = config
  }
  step(dt: number) {
    const { stiffness, damping } = this.config
    this.velocity += (-stiffness * (this.value - this.target) - damping * this.velocity) * dt
    this.value += this.velocity * dt
  }
  resting(precision: number) {
    return Math.abs(this.value - this.target) < precision && Math.abs(this.velocity) < precision * 10
  }
  snap(value = this.target) {
    this.value = this.target = value
    this.velocity = 0
  }
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
