let all_objects = []
let gravity_factor = 1
const threshold = 0.9

class Vector2 {
    constructor(x, y) {
        this.x = x
        this.y = y
    }
    add(other) {
        return new Vector2(this.x + other.x, this.y + other.y)
    }
    scale(factor) {
        return new Vector2(this.x * factor, this.y * factor)
    }
    vector_scale(other) {
        return new Vector2(this.x * other.x, this.y * other.y)
    }
    sqr_dist(other) {
        return (other.x - this.x) * (other.x - this.x) + (other.y - this.y) * (other.y - this.y)
    }
    normalize() {
        return this.scale(1/Math.sqrt(this.sqr_dist(new Vector2(0, 0))))
    }
}

class Rectangle {
    constructor(top_left, bottom_right) {
        this.top_left = top_left
        this.bottom_right = bottom_right
    }

    getX() {
        return this.top_left.x
    }

    getY() {
        return this.top_left.y
    }

    getWidth() {
        return this.bottom_right.x - this.top_left.x
    }

    getHeight() {
        return this.bottom_right.y - this.top_left.y
    }
}

class PhysicalProperties {
    constructor(velocity, mass, gravity, dimensions, elasticity, is_kinematic, collide_top_only) {
        this.mass = mass
        this.dimensions = dimensions
        this.is_kinematic = is_kinematic
        this.velocity = velocity
        this.elasticity = elasticity
        this.gravity = gravity
        this.collide_top_only = collide_top_only === undefined ? false : collide_top_only
    }
    add_force(force) {
        if (this.mass === Infinity) {
            return
        }
        this.velocity = this.velocity.add(force.scale(1.0 / this.mass))
    }
}

class GameObject {
    constructor(position, physical_properties, tags, components) {
        this.position = new Vector2(position.x, position.y)
        this.physical_properties = physical_properties
        this.tags = tags
        this.components = components
        Object.values(components).forEach(component => {
            component.gameobject = this
            if (component.init !== undefined) {
                component.init()
            }
        })
    }

    add_component(component_name, component) {
        this.components[component_name] = component
        component.gameobject = this
        return this
    }
}

function get_object_bounds(position, dimensions) {
    return new Rectangle(
        position.add(dimensions.scale(-0.5)),
        position.add(dimensions.scale(0.5))
    )
}

function get_intersection(r1, r2) {
    let leftX = Math.max(r1.getX(), r2.getX());
    let rightX = Math.min(r1.getX() + r1.getWidth(), r2.getX() + r2.getWidth());
    let topY = Math.max(r1.getY(), r2.getY());
    let bottomY = Math.min(r1.getY() + r1.getHeight(), r2.getY() + r2.getHeight());
    return { leftX : leftX, rightX : rightX, topY : topY, bottomY : bottomY }
}

function colliding(obj1, obj2) {
    let r1 = get_object_bounds(obj1.position, obj1.physical_properties.dimensions)
    let r2 = get_object_bounds(obj2.position, obj2.physical_properties.dimensions)

    let inter = get_intersection(r1, r2)
    let width = inter.rightX - inter.leftX
    let height = inter.bottomY - inter.topY
    let intersection_area = width * height

    let future_r1 = get_object_bounds(
        obj1.position.add(obj1.physical_properties.velocity),
        obj1.physical_properties.dimensions
    )

    let future_r2 = get_object_bounds(
        obj2.position.add(obj2.physical_properties.velocity),
        obj2.physical_properties.dimensions
    )

    let future_inter = get_intersection(future_r1, future_r2)
    let future_intersection_area = (future_inter.rightX - future_inter.leftX) * (future_inter.bottomY - future_inter.topY)

    if (inter.leftX < inter.rightX && inter.topY < inter.bottomY) {
        let x_intersect = width < height
        let actual_diff_width = obj1.position.x > obj2.position.x ? width : -width
        let actual_diff_height = obj1.position.y > obj2.position.y ? height : -height

        return { 
            x : x_intersect, 
            y : !x_intersect, 
            diff : x_intersect ? actual_diff_width : actual_diff_height,
            future : future_intersection_area >= intersection_area * (threshold)
        }
    } else {
        return { x : false, y : false }
    }
}

function get_coll(a, b, get_member) {
    let C = a.physical_properties.elasticity * b.physical_properties.elasticity
    return collision_calculation(
        C, 
        a.physical_properties.mass, 
        b.physical_properties.mass, 
        get_member(a.physical_properties.velocity), 
        get_member(b.physical_properties.velocity)
    )
}

function collision_calculation(C, m1, m2, v1, v2) {
    if (m1 === Infinity) {
        return 0
    }
    if (m2 === Infinity) {
        return C * -v1
    }
    return (C * m2 * (v2 - v1) + m1 * v1 + m2 * v2) / (m1 + m2)
}

function handle_collisions() {
    for (let i = 0; i < all_objects.length; i++) {
        let obj1 = all_objects[i]
        for (let j = i + 1; j < all_objects.length; j++) {
            let obj2 = all_objects[j]
            let coll = colliding(obj1, obj2)
            if (!coll.x && !coll.y) { continue }

            if (obj1.physical_properties.collide_top_only && (coll.x || obj1.position.y < obj2.position.y)) {
                continue
            }

            if (obj2.physical_properties.collide_top_only && (coll.x || obj2.position.y < obj1.position.y)) {
                continue
            }

            if (!obj1.physical_properties.is_kinematic && !obj2.physical_properties.is_kinematic && coll.future) {
                let mass_fraction = null
                if (obj1.physical_properties.mass === Infinity) {
                    mass_fraction = 0
                } else if (obj2.physical_properties.mass === Infinity) {
                    mass_fraction = 1
                } else {
                    mass_fraction = obj2.physical_properties.mass / (obj1.physical_properties.mass + obj2.physical_properties.mass)
                }

                let obj1_shift = mass_fraction * coll.diff
                let obj2_shift = (1 - mass_fraction) * -coll.diff

                let get_member = null
                let set_member = null
                if (coll.x) {
                    obj1.position.x += obj1_shift
                    obj2.position.x += obj2_shift
                    get_member = velocity => velocity.x
                    set_member = (obj, val) => obj.physical_properties.velocity.x = val
                }
                if (coll.y) {
                    obj1.position.y += obj1_shift
                    obj2.position.y += obj2_shift
                    get_member = velocity => velocity.y
                    set_member = (obj, val) => obj.physical_properties.velocity.y = val
                }
                set_member(obj1, get_coll(obj1, obj2, get_member))
                set_member(obj2, get_coll(obj2, obj1, get_member))
            }

            // notify objects what they're colliding with
            Object.values(obj1.components).forEach(component => {
                if (component.collision !== undefined) {
                    component.collision(obj2, coll)
                }
            })
            Object.values(obj2.components).forEach(component => {
                if (component.collision !== undefined) {
                    component.collision(obj1, coll)
                }
            })
        }
    }
}

function handle_gravity() {
    for (let i = 0; i < all_objects.length; i++) {
        // don't apply gravity to objects with infinite mass
        // or objects that don't have any gravity
        if (all_objects[i].physical_properties.mass === Infinity) {
            continue
        }
        if (all_objects[i].physical_properties.gravity === 0) {
            continue
        }
        let force = all_objects[i].physical_properties.gravity * all_objects[i].physical_properties.mass
        all_objects[i].physical_properties.add_force(new Vector2(0, force * gravity_factor))
    } 
}

function handle_position_update() {
    for (let i = 0; i < all_objects.length; i++) {
        all_objects[i].position.x += all_objects[i].physical_properties.velocity.x
        all_objects[i].position.y += all_objects[i].physical_properties.velocity.y
    }
}