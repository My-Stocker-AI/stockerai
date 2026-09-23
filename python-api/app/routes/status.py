"""Read-only status; never trust a body-supplied user/session identifier."""
from fastapi import APIRouter
from app.services.auth import AuthCaller, Caller, assert_route_in_account, forbidden
from app.services.database import get_client

router = APIRouter()


@router.post('/get-current-status')
def current_status(caller: Caller = AuthCaller):
    db = get_client()
    sessions = db.table('sessions').select('status,current_route_id,current_machine_id').eq(
        'user_id', caller.user_id).eq('status', 'stocking').order('created_at', desc=True).limit(1).execute().data
    empty = {'session_status': 'No active session', 'route_name': 'None', 'machine_name': 'None',
             'location_name': 'None', 'current_item': 'None', 'progress': '0/0'}
    if not sessions:
        return empty
    session = sessions[0]
    if not session['current_route_id'] or not session['current_machine_id']:
        return {**empty, 'session_status': session['status']}
    route = assert_route_in_account(db, session['current_route_id'], caller)
    machines = db.table('machines').select(
        'id,route_id,machine_name,machine_number,location_name,total_items,completed_items'
    ).eq('id', session['current_machine_id']).eq('route_id', session['current_route_id']).limit(1).execute().data
    if not machines:
        raise forbidden()
    machine = machines[0]
    completed = machine['completed_items'] or 0
    total = machine['total_items'] or 0
    # Preserve this legacy status display's existing presented-count convention.
    items = db.table('items').select('product_name,quantity,slot').eq('machine_id', machine['id']).eq(
        'sequence', completed + 1).limit(1).execute().data
    item = items[0] if items else None
    description = (f"{item['product_name']} ({item['quantity']}) in {item['slot']}" if item else
                   'Machine complete' if completed >= total else 'No current item')
    return {'session_status': session['status'], 'route_name': route['route_name'],
            'route_date': route.get('delivery_date') or '', 'machine_name': machine['machine_name'],
            'machine_number': machine['machine_number'], 'location_name': machine['location_name'],
            'current_item': description, 'progress': f'{completed}/{total}',
            'completed_items': completed, 'total_items': total, 'items_remaining': max(0, total - completed)}
