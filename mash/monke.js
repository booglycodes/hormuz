let monke_skins = {
    monke : new Skin('images/monke.png', new Vector2(1, 1))
}
let banana = new Image()
banana.src = 'images/banana.png'

let monkeyImg = new Image()
monkeyImg.src = 'images/monke.png'

// moveset
// monkey passively spawns bananas and monkeys
// grab 
//    - if grabbed and not thrown:
//          - if bannana --> replenish 15 health
//          - if monke --> activate rage mode (color red), attacks deal double damage for 5 seconds
//          - if player --> deal 20 damage
//    - if grabbed and thrown:
//          - if bannana --> deal 25 damage to first object touched
//          - if monke --> explode on contact with ground, dealing 40 damage to everyone in range
//          - if player --> apply knockback
// screech 
//    - after a 200 ms delay, small knockback and stun for 1 second
// 
// slap 
//    - after a 200 ms delay, slap, dealing 40 damage

function arm_target(player, target) {
    if (target.tags.includes('monke') || target.tags.includes('banana')) {
        target.components.timer.set_time(100)
        target.components.hit_data.reset()
    }
}


function spawn_monke(player) {
    all_objects.push(armable_projectile(
        ['monke', 'grabbable'], 
        player.position.add(new Vector2(0, -100)), 
        new PhysicalProperties(new Vector2(0, 0), 10, 0.67, new Vector2(50, 50), 0, false),
        new Attack(player, undefined, [new Effect([damage(-40), knockback_velocity(1)], and_filters([]))]),
        new ImageComponent(monkeyImg, new Vector2(0, 0), false),
        30,
        100,
        6.5
    ))
}

function spawn_banana(player) {
    all_objects.push(armable_projectile(
        ['banana', 'grabbable'], 
        player.position.add(new Vector2(0, -100)), 
        new PhysicalProperties(new Vector2(0, 0), 10, 0.67, new Vector2(50, 50), 0, false),
        new Attack(player, undefined, [new Effect([damage(-10), knockback_velocity(1)], and_filters([]))]),
        new ImageComponent(banana, new Vector2(0, 0), false),
        5,
        100,
        6.5
    ))
}

function eat_target(player, target) {
    if (target.tags.includes('player')) {
        return
    }
    if (target.tags.includes('banana')) {
        player.components.stats.apply_damage(15)
        target.components.attack.delete_object = true
    } else if (target.tags.includes('monke')) {
        player.components.dmg_controller.set_damage_and_duration(2, 500)
        target.components.attack.delete_object = true
    }
}

class DamageController {
    constructor() {
        this.time = 0
    }

    set_damage_and_duration(damage_buff, duration) {
        this.gameobject.components.controller.apply_tint(duration, 'rgba(100, 0, 0, 0.5)')
        this.gameobject.components.stats.output_damage_scale = damage_buff
        this.time = duration
    }

    update() {
        if (this.time == 0) {
            this.gameobject.components.stats.output_damage_scale = 1
            this.time--
        } else if (this.time > 0) {
            this.time--
        }
    }
}

class ItemSpawner {
    constructor(time_between) {
        this.time = 0
        this.time_between = time_between
    }

    update() {
        if (this.time > this.time_between) {
            this.time = 0
            if (rand_between(0, 1) > 0.5) {
                spawn_monke(this.gameobject)
            } else {
                spawn_banana(this.gameobject)
            }
        }
        this.time++
    }
}

const monke_grab_range = 200
function create_monke(gamepad, position, ability_draw_location, skin_name) {
    let monke_grab_ability = new Ability(grab_function(monke_grab_range, 'grab'), 'monkegrab', 80, true)
    let abilities = [
        monke_grab_ability,
    ]

    return new GameObject(
        position,
        new PhysicalProperties(new Vector2(0, 0), 50, 1, new Vector2(120, 120), 0, false),
        ['monke', 'player', 'grabbable'],
        {
            controller : new PlayerControllerComponent(
                monke_skins[skin_name],
                ability_draw_location, 
                gamepad, 
                abilities, 
                new PlayerControllerProperties(-25, 25, 3, 5), 
                true
            ),
            grab : new GrabComponent(new Vector2(0.6, 0.0), new Vector2(0.5, -0.5), 120, monke_grab_ability, [
                throw_target(40),
                arm_target,
            ], [eat_target]),
            stats : new PlayerStatsComponent(150),
            dmg_controller : new DamageController(),
            item_spawner : new ItemSpawner(300)
        }
    )
}