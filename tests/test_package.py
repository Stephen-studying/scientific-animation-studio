import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from package_skill import package

class PackageTests(unittest.TestCase):
    def test_portable_reproducible_archive_excludes_machine_files(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);root=base/'demo';root.mkdir()
            (root/'SKILL.md').write_text('---\nname: demo\ndescription: demo\n---\n',encoding='utf-8')
            for relative in ('.runtime/token.txt','__pycache__/x.pyc','node_modules/a.js','.git/config','assets/player.js'):
                p=root/relative;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('fixture',encoding='utf-8')
            first=package(root,base/'first.zip');second=package(root,base/'second.zip')
            self.assertEqual(first['sha256'],second['sha256'])
            with zipfile.ZipFile(base/'first.zip') as z:
                self.assertEqual(set(z.namelist()),{'demo/SKILL.md','demo/assets/player.js'})
                for entry in first['files']:
                    self.assertEqual(hashlib.sha256(z.read('demo/'+entry['path'])).hexdigest(),entry['sha256'])
            self.assertEqual(json.loads((base/'first.manifest.json').read_text())['sha256'],first['sha256'])

    def test_existing_archive_and_inside_root_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder);root=base/'demo';root.mkdir();(root/'SKILL.md').write_text('fixture')
            with self.assertRaises(ValueError):package(root,root/'inside.zip')
            output=base/'keep.zip';output.write_text('existing')
            with self.assertRaises(ValueError):package(root,output)
            self.assertEqual(output.read_text(),'existing')

if __name__=='__main__':unittest.main()
