const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json());

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Supabase client using service role key
const supabase = createClient(
  'https://exebxtduexxgckezhdky.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Paystack webhook endpoint
app.post('/paystack-webhook', async (req, res) => {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).send('Invalid signature');
  }

  const event = req.body;
  if (event.event === 'charge.success') {
    const tx = event.data;
    const email = tx.customer.email;
    const amount = tx.amount / 100;
    const reference = tx.reference;

    // Find user by email
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (user) {
      // Log payment
      await supabase.from('payments').insert({
        user_id: user.id,
        amount,
        reference,
        status: 'Success'
      });

      // Trigger referral bonus
      if (user.referrer_id) {
        await supabase.rpc('add_referral_bonus', {
          referrer_id: user.referrer_id,
          bonus_amount: 50
        });
      }
    }
  }

  res.sendStatus(200);
});

// Health check route
app.get('/', (req, res) => {
  res.send('✅ Edo Quiz Hub Webhook is running');
});

// Start server
app.listen(3000, () => {
  console.log('✅ Web server running on port 3000');
});
