let donkey_img = new Image()
donkey_img.src = 'images/donkey.png'

let shrek_skins = {
    shrek : new Skin('images/shrek.png', new Vector2(1, 1))
}

class ShrekDownComponent {
    constructor(up_speed, down_speed, up_limit, hitbox_size) {
        this.frame = 0
        this.using_move = false
        this.down_speed = down_speed
        this.hitbox_size = hitbox_size
        this.up_speed = up_speed
        this.hitbox = null
        this.going_up = false
        this.up_limit = up_limit
        this.tmp_dmg_scale = null
        this.tmp_friction = null
    }

    update() {
        if (!this.using_move) {
            return
        }
        if (this.gameobject.position.y >  this.up_limit  && this.going_up) {
            this.gameobject.physical_properties.velocity.y = this.up_speed
            this.gameobject.physical_properties.is_kinematic = true
            if (this.tmp_dmg_scale === null) {
                this.tmp_dmg_scale = this.gameobject.components.stats.input_damage_scale
                this.gameobject.components.stats.input_damage_scale = 0
            }
        } else if (this.going_up) {
            let attack = new Attack(
                this.gameobject,
                constant_offset(this.gameobject, new Vector2(0, 0)), 
                [
                    new Effect(
                        [damage(-40),knockback_angled_posn(50, 10)],         
                        and_filters([filter_has_health(), filter_by_hit])
                    )
                ]
            )
            this.hitbox = attatched_hitbox(attack, {}, undefined, this.hitbox_size)
            all_objects.push(this.hitbox)
            this.gameobject.physical_properties.is_kinematic = false
            this.going_up = false
            this.gameobject.physical_properties.velocity.y = this.down_speed
            this.tmp_friction = this.gameobject.components.controller.properties.friction
            this.gameobject.components.controller.properties.friction = 0
        } else {
            this.gameobject.physical_properties.velocity.x = 0
        }
        this.frame++
    }

    collision(obj, coll) {
        if (!this.using_move || this.gameobject.physical_properties.is_kinematic) {
            return
        }
        if (obj.tags.includes("ground") && coll.y && obj.position.y > this.gameobject.position.y) {
            this.hitbox.components.attack.delete_object = true
            this.hitbox = null
            this.using_move = false
            this.frame = 0
            this.gameobject.components.stats.input_damage_scale = this.tmp_dmg_scale
            this.tmp_dmg_scale = null
            this.gameobject.components.controller.properties.friction = this.tmp_friction
        } else if (obj.tags.includes("donkey")) {
            obj.components.timer.set_time(100)
            obj.components.hit_data.reset()
        }
    }
}

function shrekdown(player) {
    player.components.shrekdown.using_move = true
    player.components.shrekdown.going_up = true
}

function donkey(player) {
    all_objects.push(armable_projectile(
        ['donkey', 'player', 'grabbable'], 
        player.position.add(new Vector2(0, 100)), 
        new PhysicalProperties(new Vector2(0, 0), 100, 0.67, new Vector2(135, 135), 0, false),
        new Attack(player, undefined, [new Effect([damage(-40), knockback_velocity(1)], and_filters([]))]),
        new ImageComponent(donkey_img, new Vector2(0, 0), false),
        75,
        100,
        6.5
    ))
}

function shrekstitution(player) {
    let closest_donkey = null
    let shortest_dist = Infinity
    for (let i = 0; i < all_objects.length; i++) {
        let dist = all_objects[i].position.sqr_dist(player.position)
        if (all_objects[i].tags.includes('donkey') && dist < shortest_dist) {
            closest_donkey = all_objects[i]
            shortest_dist = dist
        }
    }   

    if (closest_donkey !== null) {
        let position = player.position
        player.position = closest_donkey.position.add(new Vector2(0, 0))
        closest_donkey.position = position.add(new Vector2(0, 0))
    }
}

function arm_donkey(player, target) {
    if (target.tags.includes('donkey')) {
        target.components.timer.set_time(100)
        target.components.hit_data.reset()
    }
}

const shrek_grab_range = 200
function create_shrek(gamepad, position, ability_draw_location, skin_name) {
    let shrek_grab_ability = new Ability(grab_function(shrek_grab_range, 'shrekgrab'), 'shrekgrab', 80, true)
    let abilities = [
        new Ability(shrekdown, 'shrekdown', 500, true),
        new Ability(donkey, 'donkey', 300, true),
        shrek_grab_ability,
        new Ability(shrekstitution, 'shrekstitution', 50, true)
    ]

    return new GameObject(
        position,
        new PhysicalProperties(new Vector2(0, 0), 300, 0.4, new Vector2(170, 170), 0, false),
        ['shrek', 'player', 'grabbable'],
        {
            controller : new PlayerControllerComponent(
                shrek_skins[skin_name],
                ability_draw_location, 
                gamepad, 
                abilities, 
                new PlayerControllerProperties(-20.5, 30, 6.5, 3), 
                false
            ), 
            stats : new PlayerStatsComponent(300),
            shrekdown : new ShrekDownComponent(-20, 35, -1000, 3),
            shrekgrab : new GrabComponent(new Vector2(0, -0.8), new Vector2(0, -0.5), 120, shrek_grab_ability, [
                arm_donkey,
                throw_target(40)
            ], [])
        }
    )
}