"""
Mijozlar servislari (HTTP yo'llari yo'q — ularni payments moduli ulaydi):

    from app.modules.customers import admin as customers, finance
    await finance.balance(db, user.id)
    await customers.list_customers(db, q)
"""
