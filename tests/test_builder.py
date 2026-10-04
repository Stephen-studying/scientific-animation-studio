import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import build_animation as builder


def fixture():
    return {'version':1,'width':1280,'height':720,'duration':12,'title':'示意动画',
            'evidence':{'label':'原理示意 · 非数值仿真'},
            'elements':[{'id':'block','type':'rect','attrs':{'x':80,'y':200,'width':120,'height':80,'fill':'#123456'},
                         'tracks':[{'attribute':'x','keyframes':[[0,80],[12,500]]}]}],
            'cues':[{'start':0,'end':12,'text':'原理说明'}]}


class BuilderTests(unittest.TestCase):
    def test_offline_file_contains_editable_data_and_controls(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'中文动画.json';output=Path(folder)/'动画.html'
            source.write_text(json.dumps(fixture(),ensure_ascii=False),encoding='utf-8')
            result=builder.build(source,output)
            text=output.read_text(encoding='utf-8')
            self.assertTrue(result['offline'])
            self.assertIn('ScientificAnimation',text)
            self.assertIn('type="range"',text)
            self.assertNotIn('<script src=',text)
            self.assertNotIn('<link ',text)

    def test_existing_output_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'spec.json';output=Path(folder)/'keep.html'
            source.write_text(json.dumps(fixture()),encoding='utf-8')
            output.write_text('existing',encoding='utf-8')
            with self.assertRaises(ValueError):builder.build(source,output)
            self.assertEqual(output.read_text(),'existing')

    def test_script_payload_and_template_marker_are_literal_data(self):
        with tempfile.TemporaryDirectory() as folder:
            spec=fixture();spec['title']='__PLAYER__ </script><script>window.bad=true</script>'
            source=Path(folder)/'spec.json';output=Path(folder)/'out.html'
            source.write_text(json.dumps(spec),encoding='utf-8')
            builder.build(source,output)
            text=output.read_text(encoding='utf-8')
            self.assertNotIn('</script><script>window.bad',text)
            self.assertIn('\\u003c/script\\u003e',text)
            self.assertEqual(text.count('<script'),2)

    def test_negative_keyframe_time_is_rejected(self):
        spec=fixture();spec['elements'][0]['tracks'][0]['keyframes'][0][0]=-0.5
        with self.assertRaises(ValueError):builder.validate(spec)

    def test_duplicate_keyframe_times_are_rejected(self):
        spec=fixture();spec['elements'][0]['tracks'][0]['keyframes']=[[0,80],[0,90]]
        with self.assertRaises(ValueError):builder.validate(spec)

    def test_event_attributes_and_external_svg_are_rejected(self):
        for attrs in ({'onclick':'bad()'},{'href':'https://example.org/image.jpg'},{'fill':'url(https://example.org/x)'}):
            spec=fixture();spec['elements'][0]['attrs'].update(attrs)
            with self.assertRaises(ValueError):builder.validate(spec)

    def test_nan_and_boolean_dimensions_are_rejected(self):
        for key,value in [('duration',float('nan')),('width',True),('version',True)]:
            spec=fixture();spec[key]=value
            with self.assertRaises(ValueError):builder.validate(spec)

    def test_duplicate_element_ids_are_rejected(self):
        spec=fixture();spec['elements'].append(copy.deepcopy(spec['elements'][0]))
        with self.assertRaises(ValueError):builder.validate(spec)

    def test_unbounded_motion_and_caption_overlap_are_rejected(self):
        spec=fixture();spec['elements'][0]['motion']={'path':'M0 0L10 10','start':0,'end':13}
        with self.assertRaises(ValueError):builder.validate(spec)
        spec=fixture();spec['cues'].append({'start':3,'end':5,'text':'重叠'})
        with self.assertRaises(ValueError):builder.validate(spec)

    def test_colors_require_supported_hex_values(self):
        spec=fixture();spec['elements'][0]['tracks']=[{'attribute':'fill','keyframes':[[0,'red'],[12,'#ffffff']]}]
        with self.assertRaises(ValueError):builder.validate(spec)

    def test_example_meets_validation(self):
        path=builder.ROOT/'examples/heat-pipe/animation.json'
        builder.validate(json.loads(path.read_text(encoding='utf-8')))

    def test_clip_references_and_clip_attributes_are_guarded(self):
        spec=fixture();spec['elements'][0]['clip']='missing'
        with self.assertRaises(ValueError):builder.validate(spec)
        spec['clips']=[{'id':'missing','type':'rect','attrs':{'width':100,'height':100}}]
        builder.validate(spec)
        for key,value in [('onclick','alert(1)'),('width',-1),('rx',-1)]:
            changed=copy.deepcopy(spec);changed['clips'][0]['attrs'][key]=value
            with self.assertRaises(ValueError):builder.validate(changed)

    def test_motion_fade_rejects_invalid_ranges(self):
        for fade in (-0.1,0.6,float('nan')):
            spec=fixture();spec['elements'][0]['motion']={'path':'M0 0L10 10','start':0,'end':12,'fade':fade}
            with self.assertRaises(ValueError):builder.validate(spec)


if __name__=='__main__':unittest.main()
