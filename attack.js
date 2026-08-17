class Effect {
    constructor(funcs, filter) {
        this.funcs = funcs
        this.filter = filter
    }

    run(attack, target) {
        if (this.filter(attack, target)) {
            for (let i = 0; i < this.funcs.length; i++) {
                this.funcs[i](attack, target)
            }
        }
    }
}

function owned_by(obj, player) {
    let owned = false
    Object.values(obj.components).forEach(component => {
        if (component.player == player) {
            owned = true
        }
    })
    return owned
}

class Attack {
    constructor(player, on_update, effects) {
        this.player = player
        this.on_update = on_update
        this.effects = effects
        
        this.delete_object = false
        this.frame = 0
    }

    update() {
        if (this.on_update !== undefined) {
            this.on_update(this)
        }
        this.frame++
    }

    should_delete() {
        return this.delete_object
    }

    collision(obj) {
        if (obj === this.player) {
            return
        }
        
        for (let i = 0; i < this.effects.length; i++) {
            this.effects[i].run(this, obj)
        }
    }
}

class TimedDelete {
    constructor(frames) {
        this.frames = frames
        this.frame = 0
    }

    update() {
        this.frame++
    }

    should_delete() {
        return this.frame >= this.frames
    }
}

class Reflect {
    constructor(player, tags) {
        this.player = player
        this.tags = tags === undefined ? ['projectile'] : tags
    }
    collision(obj) {
        for (let i = 0; i < this.tags.length; i++) {
            if (obj.tags.includes(this.tags[i])) {
                obj.components.attack.player = this.player
                break
            }
        }
    }
}

class StopOnCollision {
    constructor(ignore_tag) {
        this.ignore_tag = ignore_tag
    }

    collision(obj) {
        if (obj.physical_properties.is_kinematic || obj.tags.includes(this.ignore_tag)) {
            return
        }
        this.gameobject.physical_properties.velocity = new Vector2(0, 0)
        this.first_land = false
    }
}

function rand_between(min, max) {
    return Math.random() * (max - min) + min
}

function degrees_to_radians(degrees) {
    return degrees * (Math.PI / 180)
}

function delete_self() {
    return (attack, _) => attack.delete_object = true
}

function delete_other() {
    return (_, obj) => obj.components.attack.delete_object = true
}

function knockback_angled(speed, angle) {
    return (attack, obj) => {
        let player = attack.player
        let true_angle = degrees_to_radians(player.components.controller.flip ? 180 - angle : angle)
        let force = new Vector2(Math.cos(true_angle), Math.sin(true_angle)).scale(-speed)
        obj.physical_properties.add_force(force.scale(obj.physical_properties.mass))
    }
}

function knockback_angled_posn(speed, angle) {
    return (attack, obj) => {
        let player = attack.player
        let left = player.position.add(obj.position.scale(-1)).x < 0
        let true_angle = degrees_to_radians(left ? 180 - angle : angle)
        let force = new Vector2(Math.cos(true_angle), Math.sin(true_angle)).scale(-speed)
        obj.physical_properties.add_force(force.scale(obj.physical_properties.mass))
    }
}

function knockback_velocity(factor) {
    return (attack, obj) => {
        let force = attack.gameobject.physical_properties.velocity.normalize().scale(factor)
        obj.physical_properties.add_force(force.scale(obj.physical_properties.mass))
    }
}

function damage(damage) {
    return (attack, obj) => {
        if (obj.components.stats !== undefined) {
            obj.components.stats.apply_damage(attack.player.components.stats.calculate_damage(damage))
        } else if (obj.components.health !== undefined) {
            obj.components.health.apply_damage(attack.player.components.stats.calculate_damage(damage))
        }
    }
}

function force_in_vel_dir(factor) {
    return (_, obj) => {
        let force = obj.physical_properties.velocity.scale(factor * obj.physical_properties.mass)
        obj.physical_properties.add_force(force)
    }
}

function constant_offset(player, offset_scalars) {
    let posn = new Vector2(
        (player.components.controller.flip ? 1 : -1) * player.physical_properties.dimensions.x * offset_scalars.x,
        player.physical_properties.dimensions.y * offset_scalars.y
    )
    return attack => attack.gameobject.position = posn.add(player.position)
}

function offset_changes_with_player(flip, offset_scalars, relative_scale) {
    return (attack) => {
        let player = attack.player
        attack.gameobject.components.draw.flipped = player.components.controller.flip ^ flip
        let posn = new Vector2(
            (player.components.controller.flip ? 1 : -1) * player.physical_properties.dimensions.x * offset_scalars.x,
            player.physical_properties.dimensions.y * offset_scalars.y
        )
        attack.gameobject.position = posn.add(player.position)
        attack.gameobject.physical_properties.dimensions = attack.player.physical_properties.dimensions.scale(relative_scale)
    }
}

function filter_by_tag(tag) {
    return (_, obj) => obj.tags.includes(tag)
}

function filter_by_not_tag(tag) {
    return (_, obj) => !obj.tags.includes(tag)
}

function filter_by_hit(attack, obj) {
    let has_hit = attack.gameobject.components.hit_data.hit_objects.includes(obj)
    attack.gameobject.components.hit_data.hit_objects.push(obj)
    return !has_hit
}

function filter_has_health() {
    return (_, obj) => obj.components.stats !== undefined || obj.components.health !== undefined
}

function filter_in_radius(range) {
    return (attack, obj) => {
        let diff = obj.position.add(attack.gameobject.position.scale(-1))
        return diff.x * diff.x + diff.y * diff.y < range * range
    }
}

function filter_by_not_owned_by() {
    return (attack, obj) => !owned_by(obj, attack.player)
}

function filter_by_can_damage() {
    return and_filters([filter_by_not_owned_by(), filter_has_health()])
}

function and_filters(filters) {
    return (attack, obj) => {
        for (let i = 0; i < filters.length; i++) {
            if (!filters[i](attack, obj)) {
                return false
            }
        }
        return true
    }
}

function attatched_hitbox(
    attack,
    draw_component,
    time_alive,
    relative_scale
    ) {
    let physics = new PhysicalProperties(
        new Vector2(0, 0), 
        1, 
        0, 
        attack.player.physical_properties.dimensions.scale(relative_scale), 
        0, 
        true
    )
    let obj = new GameObject(
        new Vector2(0, 0), 
        physics, 
        ["attack"], 
        {
            attack : attack,
            delete : time_alive === undefined ? {} : new TimedDelete(time_alive),
            draw : draw_component,
            hit_data : new HitData()
        }
    )
    return obj
}

function projectile(
    position,
    attack_component,
    draw_component,
    physics,
    time_alive
    ) {
    return new GameObject(
        position, 
        physics, 
        ["projectile"], 
        {
            attack : attack_component,
            delete : time_alive === undefined ? {} : new TimedDelete(time_alive),
            draw : draw_component,
            hit_data : new HitData()
        }
    )
}

class LightningComponent {
    constructor(player, time_delay, hit_range, lightning_dist_range, angle_range, start_angle, color, start_pos_randomness, range, damage) {
        this.player = player
        this.time_delay = time_delay
        this.hit_range = hit_range
        this.max_lightning_dist = lightning_dist_range.max
        this.min_lightning_dist = lightning_dist_range.min
        this.start_angle = start_angle
        this.max_angle = angle_range.max
        this.min_angle = angle_range.min
        this.frame = 0
        this.color = color
        this.start_pos_randomness = start_pos_randomness
        this.range = range
        this.damage = damage
    }

    draw() {
        if (this.frame >= this.time_delay) {
            let damage_func = damage(this.damage)
            ctx.beginPath()
            ctx.strokeStyle = this.color
            ctx.lineWidth = 2

            let start_position = new Vector2(Math.random() - 0.5, Math.random() - 0.5)
                .vector_scale(this.start_pos_randomness)
                .add(this.gameobject.position)

            ctx.moveTo(start_position.x, start_position.y)
            let curr = this.gameobject.position.add(new Vector2(0, 0))
            while (curr.y < deathfloor && Math.sqrt(curr.sqr_dist(start_position)) < this.range) {
                let dist = rand_between(this.min_lightning_dist, this.max_lightning_dist) 
                let angle = degrees_to_radians(rand_between(this.min_angle, this.max_angle) + this.start_angle) 
                curr = new Vector2(Math.cos(angle), Math.sin(angle)).scale(dist).add(curr)
                ctx.lineTo(curr.x, curr.y)
                for (let i = 0; i < all_objects.length; i++) {
                    if (all_objects[i].position.sqr_dist(curr) < this.hit_range * this.hit_range && 
                        all_objects[i] != this.player && !owned_by(all_objects[i], this.player)) {
                        damage_func(this, all_objects[i])
                    }
                }
            }
            ctx.stroke()
        }
        this.frame++
    }
}

function find_target_with_tag(gameobject, player, tag) {
    let target = null
    let min_sqr_dist = Infinity
    for (let i = 0; i < all_objects.length; i++) {
        let dist = all_objects[i].position.sqr_dist(gameobject.position)
        if (all_objects[i] !== player && all_objects[i].tags.includes(tag) && dist < min_sqr_dist) {
            target = all_objects[i]
            min_sqr_dist = dist
        }
    }
    return target
}

class GrabComponent {
    constructor(relative_self_posn, relative_other_posn, num_frames_in_grab, grab_ability, throw_effects, release_effects) {
        this.player = null
        this.relative_self_posn = relative_self_posn
        this.relative_other_posn = relative_other_posn
        this.num_frames_in_grab = num_frames_in_grab
        this.grab_ability = grab_ability
        this.throw_effects = throw_effects
        this.release_effects = release_effects
        this.target = null
        this.frame = 0
        this.current_health = 0
    }

    init() {
        this.player = this.gameobject
    }

    grab(target) {
        this.target = target
        target.physical_properties.velocity = new Vector2(0, 0)
        if (target.components.controller !== undefined) {  
            target.components.controller.freeze(this.num_frames_in_grab)
        }   
        this.frame = 0
        this.current_health = this.player.components.health.health
    }

    throw() {
        if (this.target.components.controller !== undefined) {
            this.target.components.controller.freeze_time = 0
        }
        for (let i = 0; i < this.throw_effects.length; i++) {
            this.throw_effects[i](this.player, this.target);
        }
        this.target = null
    }

    update() {
        if (this.target === null) {
            return
        }
        if (this.frame > this.num_frames_in_grab || this.player.components.health.health < this.current_health) {
            if (this.target.components.controller !== undefined) {
                this.target.components.controller.freeze_time = 0
            }       
            for (let i = 0; i < this.release_effects.length; i++) {
                this.release_effects[i](this.player, this.target);
            }
            this.target = null
            this.frame = 0
            this.grab_ability.use_single()
            return
        } else {
            let self_dim = this.gameobject.physical_properties.dimensions.vector_scale(this.relative_self_posn)
            let other_dim = this.target.physical_properties.dimensions.vector_scale(this.relative_other_posn)
            let flip = this.player.components.controller.flip ^ this.player.components.controller.flipped
            let sum = self_dim.add(other_dim)
            if (flip) {
                sum = new Vector2(-sum.x, sum.y)
            }
            this.target.position = this.gameobject.position.add(sum)
        }
        this.frame++
    }

}

function grab_function(grab_range, component_name) {
    return (player) => {
        if (player.components[component_name].target !== null) {
            player.components[component_name].throw()
            return
        }
        let target = find_target_with_tag(player, player, 'grabbable')
        if (target === null || target.position.sqr_dist(player.position) > grab_range * grab_range) {
            return
        }
        player.components[component_name].grab(target)
    }
}

function throw_target(speed) {
    return (player, target) => {
        let dir = player.components.controller.controller.controller.axes()
        target.physical_properties.velocity = dir.scale(speed)
        target.physical_properties.is_kinematic = true
        setTimeout(function() {
            target.physical_properties.is_kinematic = false
        }, 10)
    }
}

class Timer {
    constructor(time) {
        this.current_time = time;
    }

    finished() {
        return this.current_time == 0
    }

    update() {
        if (this.current_time > 0) {
            this.current_time--
        }
    }

    set_time(time) {
        this.current_time = time
    }
}

class FrictionComponent {
    constructor(friction) {
        this.friction = friction;
    }

    update() {
        this.gameobject.physical_properties.add_force(this.gameobject.physical_properties.velocity.scale(-this.friction))
    }
}

class HitData {
    constructor() {
        this.hit_objects = []
    }

    reset() {
        this.hit_objects = []
    }
}

function armable_projectile(tags, position, physics, attack_component, draw_component, health, arm_time, friction) {
    for(let i = 0; i < attack_component.effects.length; i++) {
        attack_component.effects[i].filter = and_filters([
            attack_component.effects[i].filter, 
            (attack, _) => !attack.gameobject.components.timer.finished(),
            filter_by_hit
        ])
    }

    let proj = projectile(position, attack_component, draw_component, physics, undefined)
    proj.tags = tags.concat(proj.tags)

    proj.add_component('health', new HealthComponent(health, true))
    proj.add_component('friction', new FrictionComponent(friction))
    proj.add_component('timer', new Timer(arm_time))
    return proj
}

