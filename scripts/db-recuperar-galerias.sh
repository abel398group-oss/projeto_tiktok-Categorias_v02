#!/usr/bin/env bash
# Repõe galerias (pdp_images, review_images, data_quality.enrichment) que a
# limpeza de runs deixou para trás, copiando-as de uma base de verificação
# restaurada do backup para o snapshot mais recente de cada produto na base real.
#
# PORQUE EXISTE: em 04/09/2026 a limpeza guardou "o run mais completo de cada
# dia" e apagou os outros — mas a galeria enriquecida vivia em snapshots de runs
# que não eram os mais completos. Resultado medido: 29 → 21 produtos com
# galeria; 9 perdidos. O backup pré-limpeza foi restaurado em `tiktok_shop_verif`
# e é daí que se copia.
#
# Uso:
#   bash scripts/db-recuperar-galerias.sh            # mostra o plano (não escreve)
#   bash scripts/db-recuperar-galerias.sh --apply    # escreve 1 linha por produto
set -euo pipefail
C=tiktok-shop-postgres-local; U=tiktok_dev; SRC=tiktok_shop_verif; DST=tiktok_shop_dev
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1

psql_src() { docker exec -i "$C" psql -U "$U" -d "$SRC" -v ON_ERROR_STOP=1 -t -A "$@"; }
psql_dst() { docker exec -i "$C" psql -U "$U" -d "$DST" -v ON_ERROR_STOP=1 -t -A "$@"; }

# 1) Produtos com galeria na fonte mas sem galeria no destino.
GAL='with g as (select product_ref_id, (case when jsonb_typeof(pdp_images)=$$array$$ then jsonb_array_length(pdp_images) else 0 end) n from product_snapshots offset 0) select p.product_id from products p where exists (select 1 from g where g.product_ref_id=p.id and g.n>0)'
comm -23 <(psql_src -c "$GAL order by 1" | sort) <(psql_dst -c "$GAL order by 1" | sort) > /tmp/_gal_perdidas.txt || true
N=$(grep -c . /tmp/_gal_perdidas.txt || true)
echo "produtos com galeria só na fonte: $N"
[ "$N" -eq 0 ] && { echo "nada a repor."; exit 0; }
IDS=$(paste -sd, /tmp/_gal_perdidas.txt | sed "s/\([0-9]\+\)/'\1'/g")

# 2) Exporta da fonte, por produto, o snapshot com MAIS fotos (desempate: mais recente).
psql_src -c "copy (
  with g as (select s.*, (case when jsonb_typeof(s.pdp_images)=\$\$array\$\$ then jsonb_array_length(s.pdp_images) else 0 end) n from product_snapshots s offset 0)
  select p.product_id, g.pdp_images::text, coalesce(g.review_images,'null'::jsonb)::text, coalesce(g.data_quality->'enrichment','null'::jsonb)::text, g.n
  from products p join lateral (select * from g where g.product_ref_id=p.id and g.n>0 order by g.n desc, g.captured_at desc limit 1) g on true
  where p.product_id in ($IDS)
) to stdout with (format csv, header false, delimiter E'\t')" > /tmp/_gal_fonte.tsv
echo "exportadas $(grep -c . /tmp/_gal_fonte.tsv) galerias da fonte"

# 3) Carrega numa tabela temporária no destino e mostra/aplica.
{
  echo "create temp table gal_fonte(product_id text, pdp text, rev text, enr text, n int);"
  echo "copy gal_fonte from stdin with (format csv, header false, delimiter E'\t');"
  cat /tmp/_gal_fonte.tsv
  echo "\."
  echo "with alvo as (
          select p.product_id, s.id sid
          from products p
          join lateral (select id from product_snapshots x where x.product_ref_id=p.id order by captured_at desc limit 1) s on true
          where p.product_id in ($IDS))
        select f.product_id, a.sid alvo, f.n fotos from gal_fonte f join alvo a using (product_id) order by 1;"
  if [ "$APPLY" -eq 1 ]; then
    echo "with alvo as (
            select p.product_id, s.id sid
            from products p
            join lateral (select id from product_snapshots x where x.product_ref_id=p.id order by captured_at desc limit 1) s on true
            where p.product_id in ($IDS))
          update product_snapshots ps
             set pdp_images   = f.pdp::jsonb,
                 review_images = case when f.rev = 'null' then ps.review_images else f.rev::jsonb end,
                 -- data_quality pode ser JSON null (nao SQL NULL): coalesce nao apanha
                 -- esse caso e 'null'::jsonb || '{...}'::jsonb devolve [null,{...}], nao um
                 -- merge. Aconteceu a 7 linhas em 04/09/2026. Testar o TIPO e o correcto.
                 data_quality  = case when f.enr = 'null' then ps.data_quality
                                      else (case when jsonb_typeof(ps.data_quality)='object'
                                                 then ps.data_quality else '{}'::jsonb end)
                                           || jsonb_build_object('enrichment', f.enr::jsonb) end
            from gal_fonte f join alvo a using (product_id)
           where ps.id = a.sid;"
    echo "select 'repostas: '||count(*) from products p where p.product_id in ($IDS) and exists (select 1 from product_snapshots s where s.product_ref_id=p.id and jsonb_typeof(s.pdp_images)='array');"
  else
    echo "select '[plano apenas] nada foi escrito. Para aplicar: --apply';"
  fi
} | psql_dst
