import { motion } from 'framer-motion'
import { FlaskConical, Search, ArrowLeftRight, Shapes, TriangleAlert, PenLine } from 'lucide-react'
import { SectionHeading } from './shared'
import { EASE_OUT } from './motion'
import { CodeBlock } from './cl-highlight'
import { useI18n } from '@/i18n/context'

/* code samples — evaluated against the real image; expected outputs in
 * the strings below were captured from the SBCL wasm run (see
 * scripts/chemicl-verify.mjs) */
const SMILES_CODE = `;;; molecules straight from SMILES strings
(defparameter *caffeine*
  (chemicl:parse-smiles-string "Cn1cnc2c1c(=O)n(C)c(=O)n2C"
                               :name "caffeine"))

(list (chemicl:molecular-formula *caffeine*)
      (chemicl:mass *caffeine*)
      (chemicl:exact-mass *caffeine*))

;;; stereo markers and isotope brackets parse too (stereo is dropped —
;;; a 2-D atom/bond graph cannot carry it)
(chemicl:molecular-formula
  (chemicl:parse-smiles-string "[13CH4]"))`

const SMILES_OUT = `;;=> ("C8H10N4O2" 194.1906008720398d0 194.08037495613098d0)
;;=> "C1H4"`

const ROUNDTRIP_CODE = `;;; write a molecule back out as (non-canonical) SMILES,
;;; and re-parse it — the round trip preserves the formula
(let* ((m (chemicl:parse-smiles-string "CC(=O)Oc1ccccc1C(=O)O")) ; aspirin
       (smi (chemicl:write-smiles-string m)))
  (list smi
        (chemicl:molecular-formula m)
        (chemicl:molecular-formula (chemicl:parse-smiles-string smi))))`

const ROUNDTRIP_OUT = `;;=> ("[OH]C(=O)c1([cH][cH][cH][cH]c1OC(=O)[CH3])"
;;=>   "C9H8O4" "C9H8O4")`

const ELEMENT_CODE = `;;; the periodic table that ships with the port
(list (chemicl:name (chemicl:get-element 26))
      (chemicl:mass (chemicl:get-element "Fe"))
      (chemicl:electronegativity (chemicl:get-element :o))
      (chemicl:isotope-exact-mass
        (chemicl:get-isotope "C" 13)))`

const ELEMENT_OUT = `;;=> ("iron" 55.845 3.44 13.003355)`

const DRAW_CODE = `;;; depict a molecule: parse + 2-D layout + SVG, in the cell
(chemicl:show-smiles "Cn1cnc2c1c(=O)n(C)c(=O)n2C" :name "caffeine")

;;; any molecule you built yourself draws the same way
(chemicl:show-molecule (chemicl:parse-smiles-string "OC(=O)C(C)CC(N)C(=O)O"
                                              :name "aspartic acid"))

;;; molecule-svg returns the string if you want it yourself`

const HAND_CODE = `;;; by hand: atoms, bonds, and the helpers around them
(defparameter *water*
  (let ((mol (chemicl:make-molecule :name "water")))
    (chemicl:add-atom mol 8 "O")
    (chemicl:add-atom mol 1 "H1")
    (chemicl:add-atom mol 1 "H2")
    (chemicl:add-bond mol "O" "H1")
    (chemicl:add-bond mol "O" "H2")
    mol))

(list (chemicl:molecular-formula *water*)
      (chemicl:atom-count *water*))

;;; ring perception — cyclohexane has exactly one six-ring
(defparameter *cyclohexane*
  (chemicl:parse-smiles-string "C1CCCCC1"))
(mapcar #'length
        (chemicl:minimal-rings (chemicl:hanser-rings *cyclohexane*)))`

const HAND_OUT = `;;=> ("H2O1" 3)
;;=> (7)`

const CARDS = [
  {
    Icon: FlaskConical,
    title: 'Molecules from SMILES',
    body: 'The bundled chemicl port parses SMILES — organic and bracket atoms, bonds, branches, ring closures, fragments — and completes the hydrogens implied by normal valences, so formulas count them. Formulas print the element count even when it is one (H2O1 — upstream behavior).',
  },
  {
    Icon: ArrowLeftRight,
    title: 'Round-trip writing',
    body: 'write-smiles-string emits a non-canonical SMILES (insertion-order DFS, ring digits paired, brackets where needed). Parsing it back reproduces the formula and mass exactly — verified against RDKit over an 18-molecule battery.',
  },
  {
    Icon: PenLine,
    title: 'Drawn, not just counted',
    body: 'show-smiles parses a SMILES string and draws the molecule right in the cell: a force-directed 2-D layout, carbons as bare vertices, heteroatoms labeled, double/triple/aromatic bonds as their line forms. The SVG travels through the same capture channel gnuplot plots use, so the usual Download SVG/PNG toolbar applies.',
  },
  {
    Icon: Search,
    title: 'Element & isotope data',
    body: 'The full periodic table and IUPAC isotope data ship inside the port (converted once from the upstream XML). Look elements up by atomic number, string or keyword symbol; exact-mass uses the isotope table.',
  },
  {
    Icon: Shapes,
    title: 'Graphs all the way down',
    body: 'A molecule is an atom/bond graph (epigraph underneath): map-atoms, find-bonds-containing, ring perception (hanser-rings, minimal-rings), and canonicalization are all available for your own traversals.',
  },
]

export default function Chemicl() {
  const { t } = useI18n()
  return (
    <section id="chemicl" className="scroll-mt-20">
      <SectionHeading
        title="Chemistry: the chemicl sample project."
        lead="A port of Cyrus Harmon's chemicl (BSD) is bundled as a sample project — the same mechanism cl-plot uses. Open it from the Explorer, load it into the runtime, and the CHEMICL package (plus a few ready molecules) is one evaluation away."
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {CARDS.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ delay: 0.08 * i, duration: 0.45, ease: EASE_OUT }}
            className="cc-cell cc-cell-input p-6 transition-all [transition-duration:160ms] ease-snap hover:-translate-y-[3px] hover:border-strong hover:shadow-[0_8px_32px_rgba(110,168,220,0.08)]"
          >
            <card.Icon size={18} strokeWidth={1.75} className="text-steel" />
            <p className="mt-3 text-[14px] font-semibold text-primary">{t(card.title)}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">{t(card.body)}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-10 space-y-8">
        {[
          { code: SMILES_CODE, out: SMILES_OUT },
          { code: ROUNDTRIP_CODE, out: ROUNDTRIP_OUT },
          { code: ELEMENT_CODE, out: ELEMENT_OUT },
          { code: DRAW_CODE, out: undefined },
          { code: HAND_CODE, out: HAND_OUT },
        ].map((block, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
          >
            <CodeBlock code={block.code} />
            {block.out && <pre className="mt-2 overflow-x-auto rounded-lg border border-hairline bg-inset px-4 py-3 font-mono text-[12px] leading-[1.6] text-muted">{block.out}</pre>}
            {!block.out && <p className="mt-2 font-mono text-[12px] text-muted">;; the molecules render as SVG structure diagrams in the cells</p>}
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ delay: 0.2, duration: 0.45, ease: EASE_OUT }}
        className="mt-6 flex gap-3 rounded-lg border border-warning/25 bg-warning/[0.06] p-5"
      >
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" />
        <p className="text-[13px] leading-relaxed text-secondary">
          <span className="font-semibold text-primary">{t('Not chemistry-complete:')}</span>{' '}
          {t('chemicl models atoms and bonds, not 3-D structure — stereochemistry parses but is dropped, and there is no force field, conformer search or depiction. The SMILES implementation replaces the upstream parser (which needs parser-combinators and fset); every deviation is documented in PORT-NOTES.md inside the sample zip.')}
        </p>
      </motion.div>
    </section>
  )
}
