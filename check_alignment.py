import bpy
import addon_utils
from mathutils import Vector

addon_utils.enable("io_curve_svg")

bpy.ops.wm.read_factory_settings(use_empty=True)

# Import base
bpy.ops.import_curve.svg(filepath='/Users/priyanshuagrawal/Documents/svgs/software base.svg')
base_objs = [obj for obj in bpy.context.selected_objects if obj.type == 'CURVE']
base_obj = base_objs[0]
base_obj.name = "Layer_Base_White"

# Import black
bpy.ops.import_curve.svg(filepath='/Users/priyanshuagrawal/Documents/svgs/software black.svg')
black_objs = [obj for obj in bpy.context.selected_objects if obj.type == 'CURVE']
black_obj = black_objs[0]
black_obj.name = "Layer_Black"

# Import purple
bpy.ops.import_curve.svg(filepath='/Users/priyanshuagrawal/Documents/svgs/software purple.svg')
purple_objs = [obj for obj in bpy.context.selected_objects if obj.type == 'CURVE']
purple_obj = purple_objs[0]
purple_obj.name = "Layer_Purple"

print("\n--- Bounding Boxes & World Locations ---")
for obj in [base_obj, black_obj, purple_obj]:
    # Calculate bounding box in world space
    bbox_corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    min_x = min(c.x for c in bbox_corners)
    max_x = max(c.x for c in bbox_corners)
    min_y = min(c.y for c in bbox_corners)
    max_y = max(c.y for c in bbox_corners)
    print(f"{obj.name}:")
    print(f"  X range: [{min_x:.4f}, {max_x:.4f}] (width: {max_x - min_x:.4f}m)")
    print(f"  Y range: [{min_y:.4f}, {max_y:.4f}] (height: {max_y - min_y:.4f}m)")
    print(f"  Center: ({(min_x + max_x)/2:.4f}, {(min_y + max_y)/2:.4f})")
