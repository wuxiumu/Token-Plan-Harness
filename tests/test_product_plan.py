import copy
import json
import unittest
from scripts.product_plan import PLAN, validate, next_task

class ProductPlanTests(unittest.TestCase):
    def setUp(self): self.plan=json.loads(PLAN.read_text())
    def test_actual_plan_valid(self): self.assertEqual(validate(self.plan),[])
    def test_rejects_cycle(self):
        self.plan['tasks'][0]['depends_on']=[self.plan['tasks'][0]['id']]
        self.assertTrue(any('cycle' in e for e in validate(self.plan)))
    def test_rejects_missing_dependency(self):
        self.plan['tasks'][0]['depends_on']=['missing']
        self.assertTrue(any('unknown dependency' in e for e in validate(self.plan)))
    def test_done_requires_evidence(self):
        self.plan['tasks'][0].update(status='done',evidence=[])
        self.assertTrue(validate(self.plan))
    def test_next_respects_dependencies(self):
        p=copy.deepcopy(self.plan)
        for t in p['tasks']: t['status']='blocked'
        p['tasks'][1]['status']='todo'
        p['tasks'][2]['status']='todo'
        self.assertEqual(next_task(p)['id'],p['tasks'][1]['id'])
