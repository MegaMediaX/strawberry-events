#!/usr/bin/env bash
# Idempotently provision a dev pretix organizer + API token.
# Requires the pretix container to be running (docker compose up -d pretix).
# Prints a line `PRETIX_API_TOKEN=...` — paste the value into your .env.
set -euo pipefail

ORG="${PRETIX_DEFAULT_ORGANIZER:-strawberry}"

PY="from pretix.base.models import Organizer,Team,TeamAPIToken; \
o,_=Organizer.objects.get_or_create(slug='${ORG}',defaults={'name':'Strawberry Agency'}); \
t,_=Team.objects.get_or_create(organizer=o,name='API'); \
[setattr(t,k,True) for k in ['all_events','can_create_events','can_change_event_settings','can_change_items','can_view_orders','can_change_orders','can_view_vouchers','can_change_vouchers']]; \
t.save(); \
tok=TeamAPIToken.objects.filter(team=t,active=True).first() or TeamAPIToken.objects.create(team=t,name='dev'); \
print('PRETIX_API_TOKEN='+tok.token)"

echo "Provisioning pretix organizer '${ORG}'..."
docker compose exec -T pretix pretix shell -c "${PY}"
