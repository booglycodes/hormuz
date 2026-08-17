Array.prototype.rotate = function(n) {
    n = n % this.length;change_approval
    while (this.length && n < 0) n += this.length;
    this.push.apply(this, this.splice(0, n));
    return this;
}

class Controller {
    constructor(controller) {
        this.controller = controller
        this.axis_threshold = 0.05
    }

    x_axis() {
        return this.controller.axes().x
    }

    y_axis() {
        return this.controller.axes().y
    }

    axes() {
        return this.controller.axes()
    }

    jump() {
        return this.controller.jump()
    }

    get_button() {
        if (this.controller.buttons()[0] && this.controller.buttons()[1]) {
            return 4;
        }
        if (this.controller.buttons()[0] && this.controller.buttons()[2]) {
            return 5;
        }
        for (let i = 0; i < 4; i++) {
            if (this.controller.buttons()[i]) {
                return i
            }
        }
        return -1
    }
}

class Ability {
    constructor(func, name, cooldown, start_unlocked, num_uses, multi_use_cooldown) {
        this.func = func
        this.cooldown = cooldown
        this.name = name
        this.start_unlocked = start_unlocked === undefined ? false : start_unlocked
        this.num_uses = num_uses === undefined ? 1 : num_uses
        this.multi_use_cooldown = multi_use_cooldown === undefined ? 0 : multi_use_cooldown

        this.current_cooldown = this.start_unlocked ? cooldown : 0
        this.current_multi_use_cooldown = this.multi_use_cooldown
        this.num_used = 0
    }
    usable() {
        return this.current_cooldown >= this.cooldown && this.current_multi_use_cooldown >= this.multi_use_cooldown
    }
    update() {
        this.current_cooldown++
        this.current_multi_use_cooldown++
    }
    run(player) {
        if (this.num_used >= this.num_uses - 1) {
            this.use_all()
        } else {
            this.use_single()
        }
        this.func(player)
    }
    use_all() {
        this.current_cooldown = 0
        this.num_used = 0
        this.current_multi_use_cooldown = this.multi_use_cooldown
    }
    use_single() {
        this.num_used++
        this.current_multi_use_cooldown = 0
    }
    restore_all() {
        this.num_used = 0
        this.current_cooldown = this.cooldown
        this.current_multi_use_cooldown = this.multi_use_cooldown
    }
    restore_single() {
        if (this.num_used > 0) { this.num_used-- }
        this.current_cooldown = this.cooldown
        this.current_multi_use_cooldown = this.multi_use_cooldown
    }
}

class PlayerControllerProperties {
    constructor(jump_speed, accel, friction, num_jumps) {
        this.jump_speed = jump_speed
        this.accel = accel
        this.friction = friction
        this.num_jumps = num_jumps
    }
}

const out_of_bounds_dpf = 0.0005
class PlayerControllerComponent {
    constructor(skin, ability_draw_location, controller, abilities, properties, flipped) {
        this.controller = new Controller(controller)
        this.abilities = abilities
        this.properties = properties
        this.jumps_left = 0
        this.ability_switch_was_pressed = false
        this.jump_was_pressed = false
        this.flip = false
        this.skin = skin
        this.touching_ground = false
        this.speed_factor = 1
        this.flipped = flipped === undefined ? false : flipped
        this.frozen_velocity = new Vector2(0, 0)
        this.ability_draw_location = ability_draw_location
        this.freeze_time = 0
        this.stun_time = 0
        this.tint_time = 0
        this.tint_color = null
    }

    draw() {
        ctx.textAlign = 'center'
        ctx.font = "20px serif"
        for(let i = 0; i < this.abilities.length; i++) {
            if (this.abilities[i].usable()) {   
                ctx.fillStyle = 'white';
            } else {
                ctx.fillStyle = 'red';
            }
            ctx.fillText(
                this.abilities[i].name,
                this.ability_draw_location.x,
                this.ability_draw_location.y - i * 20
            )
        }

        let actual_size = this.gameobject.physical_properties.dimensions.vector_scale(this.skin.proportions)
        let actual_position = actual_size.vector_scale(this.skin.offset).add(this.gameobject.position)
        drawImage(
            this.skin.image,
            actual_position.x, 
            actual_position.y,
            actual_size.x,
            actual_size.y,
            0,
            this.flip ^ this.flipped,
            false,
            true
        )

        if (this.freeze_time > 0 || this.stun_time > 0) {
            drawRect(
                this.gameobject.position.x - this.gameobject.physical_properties.dimensions.x / 2,
                this.gameobject.position.y - this.gameobject.physical_properties.dimensions.y / 2,
                this.gameobject.physical_properties.dimensions.x,
                this.gameobject.physical_properties.dimensions.y,
                'rgba(0, 100, 100, 0.5)'
            )
        }

        if (this.tint_time > 0) {
            drawRect(
                this.gameobject.position.x - this.gameobject.physical_properties.dimensions.x / 2,
                this.gameobject.position.y - this.gameobject.physical_properties.dimensions.y / 2,
                this.gameobject.physical_properties.dimensions.x,
                this.gameobject.physical_properties.dimensions.y,
                this.tint_color
            )
        }

        let circleX = Math.min(Math.max(this.gameobject.position.x, 0), 2000)
        let circleY = Math.min(Math.max(this.gameobject.position.y, 0), 1000)
        if (circleX !== this.gameobject.position.x || circleY !==  this.gameobject.position.y) {
            drawCircle(circleX, circleY, 20, 'white', 'white', 2)
            this.gameobject.components.stats.apply_damage(-out_of_bounds_dpf * this.gameobject.components.health.max_health)
        }
    }

    update() {
        if (this.tint_time > 0) {
            this.tint_time--
        }
        if (this.freeze_time > 0) {
            this.freeze_time--
            this.gameobject.physical_properties.velocity = this.frozen_velocity
            return
        }
        this.gameobject.physical_properties.add_force(this.gameobject.physical_properties.velocity.scale(-this.properties.friction))
        if (this.stun_time > 0) {
            this.stun_time--
            return
        }

        this.jumped = false
        if (this.controller.jump() && !this.jump_was_pressed && this.jumps_left > 0) {
            this.gameobject.physical_properties.velocity.y = this.properties.jump_speed
            this.gameobject.position.y -= 5
            this.jump_was_pressed = true
            this.jumps_left--
            this.jumped = true
        } else if (!this.controller.jump()) {
            this.jump_was_pressed = false
        }

        if (this.controller.x_axis() < -0.5) {
            this.gameobject.physical_properties.add_force(new Vector2(-this.properties.accel * this.speed_factor, 0))
            this.flip = false
        } 
        if (this.controller.x_axis() > 0.5) {
            this.gameobject.physical_properties.add_force(new Vector2(this.properties.accel * this.speed_factor, 0))
            this.flip = true
        }

        let ability = this.controller.get_button()
        if (ability < this.abilities.length && ability >= 0 && this.abilities[ability].usable()) {
            this.abilities[ability].run(this.gameobject)
        }
        
        for(let i = 0; i < this.abilities.length; i++) {
            this.abilities[i].update()
        }
        if (this.touching_ground) {
            this.jumps_left = this.properties.num_jumps
        }
        this.touching_ground = false
    }

    collision(obj, coll) {
        if ((obj.tags.includes("ground") || obj.tags.includes("player")) && coll.y && obj.position.y >this.gameobject.position.y) {
            this.touching_ground = true
        }
    }

    freeze(time) {
        this.frozen_velocity = this.gameobject.physical_properties.velocity.add(new Vector2(0, 0))
        this.freeze_time += time
    }

    stun(time) {
        this.stun_time += time
    }

    apply_tint(time, tint) {
        this.tint_time = time
        this.tint_color = tint
    }

    get_ability(name) {
        for (let i = 0; i < this.abilities.length; i++) {
            if (this.abilities[i].name === name) {
                return this.abilities[i]
            }
        }
        return null
    }
}

class PlayerStatsComponent {
    constructor(max_health) {
        this.input_damage_scale = 1
        this.output_damage_scale = 1
        this.health_component = new HealthComponent(max_health)
    }

    init() {
        this.gameobject.add_component('health', this.health_component)
    }

    apply_damage(damage) {
        this.health_component.apply_damage(damage * this.input_damage_scale)
    }

    calculate_damage(damage) {
        return damage * this.output_damage_scale
    }
}

class HealthComponent {
    constructor(max_health, display) {
        this.max_health = max_health
        this.health = max_health
        this.display = this.display === undefined ? true : display
    }

    draw() {
        if (this.display) {
            ctx.textAlign = 'left'
            ctx.fillStyle = 'green'
            ctx.font = '30px serif'
            let x = this.gameobject.position.x - this.gameobject.physical_properties.dimensions.x / 2
            let y = this.gameobject.position.y - this.gameobject.physical_properties.dimensions.y
            ctx.fillText(this.health.toFixed(1), x, y)
        }
    }

    apply_damage(damage, input_damage_scale) {
        if (input_damage_scale !== undefined) {
            this.health += damage * input_damage_scale
        } else {
            this.health += damage
        }
        
        if (this.health > this.max_health) {
            this.health = this.max_health
        }
    }

    should_delete() {
        return this.health <= 0
    }
}