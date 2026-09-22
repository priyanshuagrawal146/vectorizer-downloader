import os
import sys
import json
import math
import re
import zipfile

def hex_to_linear_rgb(hex_str):
    """Convert #RRGGBB hex color to linear RGB (0.0 to 1.0) for Blender shaders."""
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 3:
        hex_str = ''.join([c*2 for c in hex_str])
    if len(hex_str) != 6:
        return (0.5, 0.5, 0.5, 1.0)
    
    r = int(hex_str[0:2], 16) / 255.0
    g = int(hex_str[2:4], 16) / 255.0
    b = int(hex_str[4:6], 16) / 255.0

    # sRGB to linear conversion
    def to_linear(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (to_linear(r), to_linear(g), to_linear(b), 1.0)

def export_bambu_3mf(filepath, layer_specs):
    """Export native multi-part .3mf project for Bambu Studio with pre-assigned colors."""
    import xml.etree.ElementTree as ET
    root = ET.Element('model', {
        'unit': 'millimeter',
        'xml:lang': 'en-US',
        'xmlns': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02',
        'xmlns:m': 'http://schemas.microsoft.com/3dmanufacturing/material/2015/02'
    })
    
    resources = ET.SubElement(root, 'resources')
    colorgroup = ET.SubElement(resources, '{http://schemas.microsoft.com/3dmanufacturing/material/2015/02}colorgroup', {'id': '1'})
    for spec in layer_specs:
        hex_col = spec['color'].lstrip('#')
        if len(hex_col) == 3: hex_col = ''.join([c*2 for c in hex_col])
        if len(hex_col) != 6: hex_col = 'CCCCCC'
        ET.SubElement(colorgroup, '{http://schemas.microsoft.com/3dmanufacturing/material/2015/02}color', {'color': f'#{hex_col}FF'})

    build = ET.SubElement(root, 'build')
    obj_id = 2
    for idx, spec in enumerate(layer_specs):
        obj = spec['obj']
        mesh = obj.data
        
        obj_elem = ET.SubElement(resources, 'object', {
            'id': str(obj_id),
            'type': 'model',
            'name': spec['clean_name'],
            'pid': '1',
            'pindex': str(idx)
        })
        mesh_elem = ET.SubElement(obj_elem, 'mesh')
        verts_elem = ET.SubElement(mesh_elem, 'vertices')
        
        for v in mesh.vertices:
            world_co = obj.matrix_world @ v.co
            ET.SubElement(verts_elem, 'vertex', {
                'x': f'{world_co.x * 1000.0:.4f}',
                'y': f'{world_co.y * 1000.0:.4f}',
                'z': f'{world_co.z * 1000.0:.4f}'
            })
            
        triangles_elem = ET.SubElement(mesh_elem, 'triangles')
        for poly in mesh.polygons:
            for i in range(1, len(poly.vertices) - 1):
                ET.SubElement(triangles_elem, 'triangle', {
                    'v1': str(poly.vertices[0]),
                    'v2': str(poly.vertices[i]),
                    'v3': str(poly.vertices[i + 1])
                })
                
        ET.SubElement(build, 'item', {'objectid': str(obj_id)})
        obj_id += 1

    content_types = '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>'''

    rels = '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>'''

    model_xml = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    with zipfile.ZipFile(filepath, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', content_types)
        zf.writestr('_rels/.rels', rels)
        zf.writestr('3D/3dmodel.model', model_xml)
    print(f"Successfully generated BambuLab 3MF file: {filepath}")

def process_nameplate_blender(config_path):
    import bpy
    import bmesh
    import mathutils

    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    fixed_width_mm = float(config.get('fixed_width_mm', 150.0))
    total_height_mm = float(config.get('total_height_mm', 3.0))
    output_dir = config.get('output_dir', './output')
    raw_job_name = config.get('job_name', 'Nameplate')
    job_name = re.sub(r'[^a-zA-Z0-9_-]', '_', raw_job_name)
    layers = config.get('layers', [])

    os.makedirs(output_dir, exist_ok=True)

    # 1. Reset Blender to an empty factory scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.length_unit = 'MILLIMETERS'

    imported_layer_objects = []
    raised_text_groups = []  # Stores letter/hole objects to extrude as raised text

    def get_spline_area(sp):
        pts = list(sp.bezier_points) if len(sp.bezier_points) > 0 else list(sp.points)
        if not pts:
            return 0.0
        xs = [p.co.x for p in pts]
        ys = [p.co.y for p in pts]
        return (max(xs) - min(xs)) * (max(ys) - min(ys))

    # 2. Extrude and stack layers cleanly along Z sequentially (anchored to base, no floating parts)
    base_layer = next((l for l in layers if l.get('role') == 'base'), layers[0] if layers else None)
    base_thickness_mm = float(base_layer['thickness_mm']) if base_layer and 'thickness_mm' in base_layer else 7.00

    cumulative_top_mm = base_thickness_mm
    layer_print_specs = []

    for idx, layer in enumerate(layers):
        svg_path = layer.get('svg_path')
        if not svg_path or not os.path.isfile(svg_path):
            print(f"Warning: SVG file not found for layer {idx}: {svg_path}")
            continue

        existing_objects = set(bpy.context.scene.objects)
        bpy.ops.import_curve.svg(filepath=svg_path)
        new_objects = [o for o in bpy.context.scene.objects if o not in existing_objects and o.type == 'CURVE']

        if not new_objects:
            print(f"Warning: No curve objects created for layer {idx}")
            continue

        is_base = (idx == 0 or layer.get('role') == 'base')
        if 'thickness_mm' in layer:
            layer_thick_mm = float(layer['thickness_mm'])
        else:
            layer_pct = float(layer.get('height_pct', 15))
            layer_thick_mm = max(0.1, (layer_pct / 100.0) * total_height_mm)

        if is_base:
            step_thickness_mm = base_thickness_mm
            z_start_mm = 0.0
            z_end_mm = base_thickness_mm
            pause_start_mm = 0.0
            pause_end_mm = base_thickness_mm
        else:
            pause_start_mm = cumulative_top_mm
            cumulative_top_mm += layer_thick_mm
            pause_end_mm = cumulative_top_mm
            # Anchor to base plate so feature is physically solid with no floating gap
            z_start_mm = base_thickness_mm
            step_thickness_mm = max(0.1, cumulative_top_mm - base_thickness_mm)
            z_end_mm = cumulative_top_mm

        step_thick_m = step_thickness_mm / 1000.0
        z_start_m = z_start_mm / 1000.0

        # Set 2D fill mode and clean base holes if base foundation
        for o in new_objects:
            o.data.dimensions = '2D'
            o.data.fill_mode = 'BOTH'
            if is_base:
                splines = list(o.data.splines)
                if splines:
                    spline_areas = []
                    for sp in splines:
                        pts = list(sp.bezier_points) if len(sp.bezier_points) > 0 else list(sp.points)
                        if pts:
                            xs = [p.co.x for p in pts]
                            ys = [p.co.y for p in pts]
                            area = (max(xs) - min(xs)) * (max(ys) - min(ys))
                            spline_areas.append((area, sp))
                    if spline_areas:
                        spline_areas.sort(key=lambda x: x[0], reverse=True)
                        # Keep outermost contour spline, strip inner hole cutouts so base is 100% solid
                        for area, sp in spline_areas[1:]:
                            o.data.splines.remove(sp)

        # Extrude each curve natively and convert to 3D manifold mesh
        mesh_parts = []
        for o in new_objects:
            o.data.extrude = step_thick_m / 2.0
            bpy.ops.object.select_all(action='DESELECT')
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.convert(target='MESH')
            if len(o.data.vertices) > 0:
                mesh_parts.append(o)

        if not mesh_parts:
            print(f"Warning: No valid mesh parts for layer {idx}")
            continue

        if len(mesh_parts) > 1:
            bpy.ops.object.select_all(action='DESELECT')
            for m in mesh_parts:
                m.select_set(True)
            bpy.context.view_layer.objects.active = mesh_parts[0]
            bpy.ops.object.join()
            joined_obj = bpy.context.view_layer.objects.active
        else:
            joined_obj = mesh_parts[0]

        # Clean mesh: weld overlapping duplicate vertices and ensure consistent outward normals
        bpy.ops.object.select_all(action='DESELECT')
        joined_obj.select_set(True)
        bpy.context.view_layer.objects.active = joined_obj
        try:
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.remove_doubles(threshold=0.0001)
            bpy.ops.mesh.normals_make_consistent(inside=False)
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception as e:
            print(f"Notice: mesh cleanup on {joined_obj.name}: {e}")
            if bpy.context.mode != 'OBJECT':
                bpy.ops.object.mode_set(mode='OBJECT')

        raw_name = layer.get('name', f'Layer_{idx+1}')
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', raw_name)
        clean_name = f"{idx+1:02d}_{safe_name}"
        joined_obj.name = clean_name

        # Assign PBR Material & Viewport display color
        color_hex = layer.get('color_hex', '#888888')
        mat = bpy.data.materials.new(name=f"Mat_{clean_name}")
        rgb = hex_to_linear_rgb(color_hex)
        mat.diffuse_color = rgb
        joined_obj.color = rgb
        if mat.node_tree:
            for n in mat.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED':
                    n.inputs['Base Color'].default_value = rgb
                    n.inputs['Roughness'].default_value = 0.35
        joined_obj.data.materials.clear()
        joined_obj.data.materials.append(mat)

        # Exact Z positioning along [z_start, z_start + thickness]
        joined_obj.location.z = z_start_m + (step_thick_m / 2.0)
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

        imported_layer_objects.append({
            'layer': layer,
            'obj': joined_obj,
            'clean_name': clean_name,
            'thickness_mm': step_thickness_mm,
            'z_start_mm': z_start_mm,
            'z_end_mm': z_end_mm,
            'pause_start_mm': pause_start_mm,
            'pause_end_mm': pause_end_mm,
            'color': color_hex
        })

    if not imported_layer_objects:
        raise RuntimeError("No layer objects were imported successfully from SVGs.")

    # 3. Clean up imported SVG collections so objects reside cleanly in Scene Collection
    for c in list(bpy.data.collections):
        if c.name.endswith('.svg') or c.name.startswith('layer_'):
            for obj in list(c.objects):
                if obj.name not in bpy.context.scene.collection.objects:
                    bpy.context.scene.collection.objects.link(obj)
                c.objects.unlink(obj)
            bpy.data.collections.remove(c)

    # 4. Calculate global bounding box across all objects
    min_x, max_x = float('inf'), float('-inf')
    min_y, max_y = float('inf'), float('-inf')

    for item in imported_layer_objects:
        o = item['obj']
        for corner in o.bound_box:
            world_corner = o.matrix_world @ mathutils.Vector(corner)
            min_x = min(min_x, world_corner.x)
            max_x = max(max_x, world_corner.x)
            min_y = min(min_y, world_corner.y)
            max_y = max(max_y, world_corner.y)

    raw_width_m = max_x - min_x
    raw_height_m = max_y - min_y
    target_width_m = fixed_width_mm / 1000.0
    scale_factor = target_width_m / raw_width_m if raw_width_m > 0 else 1.0
    proportional_height_mm = (raw_height_m * scale_factor) * 1000.0

    print(f"Raw width: {raw_width_m:.4f}m, height: {raw_height_m:.4f}m")
    print(f"Scaling to {fixed_width_mm:.2f}mm width (proportional height: {proportional_height_mm:.2f}mm)")

    # 5. Scale objects in XY only (Z height is already calibrated in millimeters)
    bpy.ops.object.select_all(action='DESELECT')
    for item in imported_layer_objects:
        o = item['obj']
        o.select_set(True)
        o.scale = (scale_factor, scale_factor, 1.0)

    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # 6. Center objects horizontally and vertically around origin (0, 0)
    c_min_x, c_max_x = float('inf'), float('-inf')
    c_min_y, c_max_y = float('inf'), float('-inf')
    for item in imported_layer_objects:
        o = item['obj']
        for corner in o.bound_box:
            wc = o.matrix_world @ mathutils.Vector(corner)
            c_min_x = min(c_min_x, wc.x)
            c_max_x = max(c_max_x, wc.x)
            c_min_y = min(c_min_y, wc.y)
            c_max_y = max(c_max_y, wc.y)

    center_x = (c_min_x + c_max_x) / 2.0
    center_y = (c_min_y + c_max_y) / 2.0

    for item in imported_layer_objects:
        o = item['obj']
        o.location.x -= center_x
        o.location.y -= center_y
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    # Build layer_print_specs
    for item in imported_layer_objects:
        layer_print_specs.append({
            'name': item['layer'].get('name'),
            'clean_name': item['clean_name'],
            'color': item['color'],
            'role': item['layer'].get('role'),
            'pct': (item['thickness_mm'] / total_height_mm) * 100.0,
            'thickness_mm': item['thickness_mm'],
            'z_start_mm': item['z_start_mm'],
            'z_end_mm': item['z_end_mm'],
            'pause_start_mm': item.get('pause_start_mm', item['z_start_mm']),
            'pause_end_mm': item.get('pause_end_mm', item['z_end_mm']),
            'obj': item['obj']
        })

    # Set 3D Viewport Shading to Solid with Material Colors
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                for space in area.spaces:
                    if space.type == 'VIEW_3D':
                        space.shading.type = 'SOLID'
                        space.shading.color_type = 'MATERIAL'

    # 7. Export STLs (with global_scale=1000.0 to convert meters to standard 3D printing millimeters)
    exported_stl_files = []

    for spec in layer_print_specs:
        bpy.ops.object.select_all(action='DESELECT')
        spec['obj'].select_set(True)
        bpy.context.view_layer.objects.active = spec['obj']

        stl_filename = f"{spec['clean_name']}_{spec['thickness_mm']:.2f}mm.stl"
        stl_path = os.path.join(output_dir, stl_filename)
        bpy.ops.wm.stl_export(
            filepath=stl_path,
            export_selected_objects=True,
            global_scale=1000.0,
            ascii_format=False,
            apply_modifiers=True
        )
        exported_stl_files.append(stl_path)
        spec['stl_file'] = stl_filename

    # Export combined multi-body STL
    bpy.ops.object.select_all(action='SELECT')
    combined_filename = f"{job_name}_Combined_150mm.stl"
    combined_path = os.path.join(output_dir, combined_filename)
    bpy.ops.wm.stl_export(
        filepath=combined_path,
        export_selected_objects=True,
        global_scale=1000.0,
        ascii_format=False,
        apply_modifiers=True
    )
    exported_stl_files.append(combined_path)

    # 8. Export Native BambuLab 3MF Project File
    three_mf_filename = f"{job_name}_150mm.3mf"
    three_mf_path = os.path.join(output_dir, three_mf_filename)
    try:
        export_bambu_3mf(three_mf_path, layer_print_specs)
    except Exception as e:
        print(f"Warning: 3MF export encountered: {e}")

    # 9. Save native Blender .blend file
    blend_filename = f"{job_name}_150mm.blend"
    blend_path = os.path.join(output_dir, blend_filename)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)

    # 10. Generate BambuLab / 3D Printing Filament Swap Guide
    guide_filename = "Filament_Swap_Guide.txt"
    guide_path = os.path.join(output_dir, guide_filename)
    with open(guide_path, 'w', encoding='utf-8') as f:
        f.write("=" * 60 + "\n")
        f.write(f"  FDM 3D PRINTING GUIDE: {job_name}\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"DIMENSIONS:\n")
        f.write(f"  * Fixed Width: 150.0 mm\n")
        f.write(f"  * Proportional Height: {proportional_height_mm:.2f} mm\n")
        f.write(f"  * Total Thickness: {total_height_mm:.2f} mm\n\n")
        f.write("-" * 60 + "\n")
        f.write("BAMBU STUDIO / MULTI-MATERIAL PRINTING (AMS):\n")
        f.write(f"  METHOD 1 (RECOMMENDED): Open '{three_mf_filename}' directly in Bambu Studio.\n")
        f.write("    All objects and colors are already configured and placed on the print bed!\n\n")
        f.write("  METHOD 2: Drag and drop all individual layer STLs into Bambu Studio simultaneously.\n")
        f.write("    When prompted 'Load these files as a single object with multiple parts?', click YES.\n")
        f.write("    Assign each part to its corresponding filament slot (AMS / Spool).\n\n")
        f.write("-" * 60 + "\n")
        f.write("SINGLE EXTRUDER MANUAL FILAMENT SWAPS (Layer Pauses):\n")
        for i, spec in enumerate(layer_print_specs):
            if i == 0:
                pause_note = " (INITIAL FILAMENT - BASE)"
            else:
                pause_note = f" -> PAUSE PRINTER AT Z = {spec['pause_start_mm']:.2f} mm AND SWAP FILAMENT TO {spec['color']}"
            f.write(f"  [Layer {i+1}] {spec['name']} ({spec['color']})\n")
            f.write(f"    - Print Layer Range: {spec['pause_start_mm']:.2f} mm to {spec['pause_end_mm']:.2f} mm\n")
            f.write(f"    - Action: {pause_note}\n\n")
        f.write("=" * 60 + "\n")

    # 11. Bundle everything into a single downloadable ZIP archive
    zip_filename = f"{job_name}_BambuLab_Package.zip"
    zip_path = os.path.join(output_dir, zip_filename)
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        if os.path.exists(three_mf_path):
            z.write(three_mf_path, os.path.basename(three_mf_path))
        for stl in exported_stl_files:
            z.write(stl, os.path.basename(stl))
        z.write(blend_path, os.path.basename(blend_path))
        z.write(guide_path, os.path.basename(guide_path))

    result = {
        'status': 'success',
        'job_name': job_name,
        'fixed_width_mm': fixed_width_mm,
        'proportional_height_mm': proportional_height_mm,
        'total_height_mm': round(cumulative_top_mm, 2),
        'zip_file': zip_filename,
        'zip_path': zip_path,
        'bambu_3mf': three_mf_filename if os.path.exists(three_mf_path) else None,
        'blend_file': blend_filename,
        'combined_stl': combined_filename,
        'layers': [
            {
                'name': s['name'],
                'color': s['color'],
                'role': s['role'],
                'thickness_mm': s['thickness_mm'],
                'z_start_mm': s['z_start_mm'],
                'z_end_mm': s['z_end_mm'],
                'stl_file': s['stl_file']
            }
            for s in layer_print_specs
        ]
    }

    result_json_path = os.path.join(output_dir, 'result.json')
    with open(result_json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)

    print(json.dumps(result, indent=2))
    return result

if __name__ == '__main__':
    # Parse CLI arguments when run via blender --background --python blender_processor.py -- --config <path>
    args = sys.argv
    config_file = None
    if '--' in args:
        user_args = args[args.index('--') + 1:]
        for i in range(len(user_args)):
            if user_args[i] in ('--config', '-c') and i + 1 < len(user_args):
                config_file = user_args[i + 1]

    if not config_file:
        print("Usage: blender --background --python blender_processor.py -- --config <config.json>")
        sys.exit(1)

    process_nameplate_blender(config_file)
